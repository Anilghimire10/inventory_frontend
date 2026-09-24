'use client';
import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { useStoreScope } from '@/store/StoreContext';
import { ShiftsApi } from '@/api';
import type { OpenShiftSummary, ShiftReport } from '@/types';

interface ShiftState {
  shift: ShiftReport | null;
  isLoading: boolean;
  isOpening: boolean;
  isClosing: boolean;
  isReporting: boolean;
  openShift: (openingFloat: number, note?: string, storeId?: string) => Promise<void>;
  closeShift: (countedCash: number, note?: string) => Promise<ShiftReport | null>;
  /** Freshly computed totals for the open shift — the X report. */
  loadReport: () => Promise<ShiftReport | null>;
  /**
   * Tills open at this store that the viewer could join, when the server
   * could not pick for them. Only ever populated for an owner or manager
   * with no till of their own and more than one running.
   */
  joinable: OpenShiftSummary[];
  /** Work on one of them. Remembered per store for this browser. */
  joinShift: (id: string) => void;
}

const Ctx = createContext<ShiftState>(null as never);
export const useShift = () => useContext(Ctx);

/** Roles the backend's /shifts endpoints accept — a STOCK_KEEPER never touches a till. */
const TILL_ROLES = ['OWNER', 'MANAGER', 'CASHIER'];

/** Roles allowed to work on a till someone else opened. Mirrors the API. */
const MANAGEMENT = ['OWNER', 'MANAGER'];

/**
 * The till this browser picked at a given store.
 *
 * localStorage rather than server state on purpose: it answers "which drawer
 * is this device standing at", which is a property of the counter, not of the
 * account. The same owner on their phone in the back office should not
 * inherit the till their tablet is on at the front.
 */
const joinKey = (storeId: string) => `shift-join:${storeId || 'default'}`;

/**
 * Read through `useSyncExternalStore` rather than mirrored into state.
 *
 * localStorage is an external store, and this is the API React provides for
 * one: the server snapshot is `null`, so nothing can hydrate mismatched, and
 * writes from anywhere -- including another tab, via the `storage` event --
 * re-render everyone reading it without a `setState` in an effect.
 */
const joinListeners = new Set<() => void>();

function subscribeJoined(onChange: () => void) {
  joinListeners.add(onChange);
  // Another tab at the same counter switching till should move this one too.
  window.addEventListener('storage', onChange);
  return () => {
    joinListeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function readJoinedShift(storeId: string): string | null {
  try {
    return localStorage.getItem(joinKey(storeId));
  } catch {
    return null; // private mode, blocked storage -- fall back to no choice
  }
}
function writeJoinedShift(storeId: string, id: string) {
  try {
    localStorage.setItem(joinKey(storeId), id);
  } catch {
    // Not remembering it only costs one extra tap next load.
  }
  joinListeners.forEach((l) => l());
}
function clearJoinedShift(storeId: string) {
  try {
    localStorage.removeItem(joinKey(storeId));
  } catch {
    // Nothing to clean up if it was never written.
  }
  joinListeners.forEach((l) => l());
}

export function ShiftProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const enabled = !!user && TILL_ROLES.includes(user.role);

  // A user may have one open till per store, so "the current shift" only
  // means anything once you say which branch. Switching in the header brings
  // up that branch's till and leaves the other one open behind you.
  const { storeId } = useStoreScope();
  // One key, used by the query *and* by every direct write below. They used to
  // read ['shift-current'] literally, which stopped matching the moment the
  // store was added to it -- closing a shift then wrote to a key nobody read,
  // leaving the till still showing an open shift.
  // Memoised: a fresh array each render would defeat the useCallback deps
  // that now depend on it.
  // Which till this browser has chosen to work on at this store, for the case
  // where several are open and the server cannot pick. Per store and per
  // browser because it describes where the person is physically standing,
  // which is not something the account knows.
  const joinedId = useSyncExternalStore(
    subscribeJoined,
    () => readJoinedShift(storeId),
    () => null, // server render: nothing is remembered yet
  );

  const shiftKey = useMemo(
    () => ['shift-current', storeId, joinedId],
    [storeId, joinedId],
  );
  const { data, isLoading } = useQuery({
    queryKey: shiftKey,
    // A remembered till goes stale on its own -- the cashier counts it and
    // closes it, and the id stops resolving. Rather than surfacing that as an
    // error and waiting for a re-render to recover, fall back here: forget
    // the choice and ask again the ordinary way, in the same fetch.
    queryFn: async () => {
      if (joinedId) {
        try {
          return await ShiftsApi.current(storeId || undefined, joinedId);
        } catch {
          clearJoinedShift(storeId);
        }
      }
      return ShiftsApi.current(storeId || undefined);
    },
    enabled,
    staleTime: 15_000,
  });
  const shift = data ?? null;

  // Only asked when the server came back empty-handed: either there is no
  // till open here at all, or there are several and it would not guess.
  const canJoin = enabled && !!user && MANAGEMENT.includes(user.role);
  const { data: openShifts } = useQuery({
    queryKey: ['shift-open', storeId],
    queryFn: () => ShiftsApi.openAtStore(storeId),
    enabled: canJoin && !!storeId && !isLoading && !shift,
    staleTime: 15_000,
  });
  const joinable = useMemo(
    () => (openShifts ?? []).filter((s) => !s.isOwnShift),
    [openShifts],
  );

  const joinShift = useCallback(
    (id: string) => writeJoinedShift(storeId, id),
    [storeId],
  );

  const openMutation = useMutation({
    mutationFn: (vars: { openingFloat: number; note?: string; storeId?: string }) =>
      ShiftsApi.open(vars),
    onSuccess: () => {
      clearJoinedShift(storeId);
      qc.invalidateQueries({ queryKey: ['shift-current'] });
      qc.invalidateQueries({ queryKey: ['shift-open'] });
    },
  });
  // `storeId` is passed explicitly rather than left to the server's fallback:
  // the shift must open against the same store the till is selling from, or
  // its Z report reconciles one store's drawer against another's stock.
  const openShift = useCallback(
    async (openingFloat: number, note?: string, storeId?: string) => {
      await openMutation.mutateAsync({ openingFloat, note, storeId });
    },
    [openMutation],
  );

  // Read-only mid-shift snapshot. Deliberately not served from the
  // `shift-current` cache: an X report is taken to see where the drawer stands
  // *now*, and that cache is 15s stale by design.
  const reportMutation = useMutation({
    mutationFn: (id: string) => ShiftsApi.report(id),
  });
  const loadReport = useCallback(async (): Promise<ShiftReport | null> => {
    if (!shift) return null;
    const fresh = await reportMutation.mutateAsync(shift.id);
    // `shift-current` must only ever hold an *open* shift — the POS decides
    // whether to block the till on its presence alone. The report endpoint
    // serves closed shifts too (`isOpen: shift.closedAt === null`), so if this
    // one was closed from another device, clear the key instead of pinning a
    // closed shift into it and offering "Close shift" for a shift that would
    // now reject it.
    qc.setQueryData(shiftKey, fresh.isOpen ? fresh : null);
    if (!fresh.isOpen) {
      qc.invalidateQueries({ queryKey: ['shift-history'] });
    }
    return fresh;
  }, [shift, reportMutation, qc, shiftKey]);

  const closeMutation = useMutation({
    mutationFn: (vars: { id: string; countedCash: number; note?: string }) =>
      ShiftsApi.close(vars.id, { countedCash: vars.countedCash, note: vars.note }),
    onSuccess: () => {
      qc.setQueryData(shiftKey, null);
      // The drawer we were working on is counted and gone; a remembered
      // pointer to it would only resolve to a closed shift.
      clearJoinedShift(storeId);
      qc.invalidateQueries({ queryKey: ['shift-history'] });
      qc.invalidateQueries({ queryKey: ['shift-open'] });
    },
  });
  const closeShift = useCallback(
    async (countedCash: number, note?: string): Promise<ShiftReport | null> => {
      if (!shift) return null;
      return closeMutation.mutateAsync({ id: shift.id, countedCash, note });
    },
    [shift, closeMutation],
  );

  const value = useMemo<ShiftState>(
    () => ({
      shift,
      isLoading: enabled && isLoading,
      isOpening: openMutation.isPending,
      isClosing: closeMutation.isPending,
      isReporting: reportMutation.isPending,
      openShift,
      closeShift,
      loadReport,
      joinable,
      joinShift,
    }),
    [
      shift,
      enabled,
      isLoading,
      openMutation.isPending,
      closeMutation.isPending,
      reportMutation.isPending,
      openShift,
      closeShift,
      loadReport,
      joinable,
      joinShift,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
