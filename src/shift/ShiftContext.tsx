'use client';
import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { useStoreScope } from '@/store/StoreContext';
import { ShiftsApi, type CloseShiftBody } from '@/api';
import { apiErrorCode } from '@/lib/api';
import type { CashMovementReason, CashMovementType, OpenShiftSummary, ShiftReport } from '@/types';

interface ShiftState {
  shift: ShiftReport | null;
  isLoading: boolean;
  /**
   * The current shift couldn't be loaded. Not the same as "no shift": the
   * till may well have one open, so the POS must not offer to open another.
   */
  isError: boolean;
  retry: () => void;
  isOpening: boolean;
  isClosing: boolean;
  isReporting: boolean;
  /**
   * `separateDrawer`: an owner or manager opening a second shift where a
   * till is already running -- only for a counter with its own cash.
   */
  openShift: (
    openingFloat: number,
    note?: string,
    storeId?: string,
    separateDrawer?: boolean,
  ) => Promise<void>;
  closeShift: (body: CloseShiftBody) => Promise<ShiftReport | null>;
  /** Pay in / pay out on the till being worked on. */
  moveCash: (body: {
    type: CashMovementType;
    reason: CashMovementReason;
    amount: number;
    note?: string;
  }) => Promise<void>;
  isMovingCash: boolean;
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
  /**
   * Every till open at this store, the viewer's own included -- for an owner
   * or manager to move between them. Empty for a cashier, who only ever
   * works their own.
   */
  tills: OpenShiftSummary[];
  /**
   * Sell into another open till from now on: someone else's, or back to
   * one's own. The till left behind stays open. Remembered per store for
   * this browser, like a join.
   */
  switchTill: (id: string) => void;
  /**
   * The store the till sells from, as the POS resolved it. The shift is
   * looked up there rather than at the header's selection, which for an
   * owner is usually "all stores" -- and with no store the server can't
   * tell which till to put them on.
   */
  setTillStore: (storeId: string | null) => void;
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
  const { storeId: scopeStoreId } = useStoreScope();
  const [tillStoreId, setTillStoreId] = useState<string | null>(null);
  const storeId = tillStoreId ?? scopeStoreId;
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
  const { data, isLoading, isError, refetch } = useQuery({
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

  // Every till open here, for management: offered to join when the server
  // came back empty-handed (none of their own, several running), and to
  // switch between once they are on one.
  const canJoin = enabled && !!user && MANAGEMENT.includes(user.role);
  const { data: openShifts } = useQuery({
    queryKey: ['shift-open', storeId],
    queryFn: () => ShiftsApi.openAtStore(storeId),
    enabled: canJoin && !!storeId && !isLoading,
    staleTime: 15_000,
  });
  const tills = useMemo(() => (canJoin ? (openShifts ?? []) : []), [canJoin, openShifts]);
  // The open-shift dialog's choice only exists while there is no till yet.
  const joinable = useMemo(
    () => (shift ? [] : tills.filter((s) => !s.isOwnShift)),
    [shift, tills],
  );

  const joinShift = useCallback(
    (id: string) => writeJoinedShift(storeId, id),
    [storeId],
  );
  // Back to one's own till is forgetting the choice: with nothing remembered
  // the server puts the caller on their own shift first. Anyone else's is
  // remembered, exactly as a join is.
  const switchTill = useCallback(
    (id: string) => {
      if (tills.find((t) => t.id === id)?.isOwnShift) clearJoinedShift(storeId);
      else writeJoinedShift(storeId, id);
    },
    [storeId, tills],
  );

  const openMutation = useMutation({
    mutationFn: (vars: {
      openingFloat: number;
      note?: string;
      storeId?: string;
      separateDrawer?: boolean;
    }) => ShiftsApi.open(vars),
    onSuccess: () => {
      clearJoinedShift(storeId);
      qc.invalidateQueries({ queryKey: ['shift-current'] });
      qc.invalidateQueries({ queryKey: ['shift-open'] });
    },
    // A till opened here since this screen loaded. Ask again: with one
    // running, the server puts an owner straight onto it.
    onError: (e) => {
      if (apiErrorCode(e) !== 'TILL_OPEN') return;
      qc.invalidateQueries({ queryKey: ['shift-current'] });
      qc.invalidateQueries({ queryKey: ['shift-open'] });
    },
  });
  // `storeId` is passed explicitly rather than left to the server's fallback:
  // the shift must open against the same store the till is selling from, or
  // its Z report reconciles one store's drawer against another's stock.
  const openShift = useCallback(
    async (openingFloat: number, note?: string, storeId?: string, separateDrawer?: boolean) => {
      await openMutation.mutateAsync({ openingFloat, note, storeId, separateDrawer });
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
    mutationFn: ({ id, ...body }: CloseShiftBody & { id: string }) =>
      ShiftsApi.close(id, body),
    onSuccess: () => {
      qc.setQueryData(shiftKey, null);
      // The drawer we were working on is counted and gone; a remembered
      // pointer to it would only resolve to a closed shift.
      clearJoinedShift(storeId);
      // Ask the server again rather than assume there is no till now: an
      // owner who closed their own drawer while a cashier's is still running
      // belongs on that one, and used to be offered a fresh shift instead.
      qc.invalidateQueries({ queryKey: ['shift-current'] });
      qc.invalidateQueries({ queryKey: ['shift-history'] });
      qc.invalidateQueries({ queryKey: ['shift-open'] });
      // What this close left in the drawer is the next shift's float.
      qc.invalidateQueries({ queryKey: ['shift-float'] });
    },
  });
  const closeShift = useCallback(
    async (body: CloseShiftBody): Promise<ShiftReport | null> => {
      if (!shift) return null;
      return closeMutation.mutateAsync({ id: shift.id, ...body });
    },
    [shift, closeMutation],
  );

  const moveMutation = useMutation({
    mutationFn: ({ id, ...body }: Parameters<ShiftState['moveCash']>[0] & { id: string }) =>
      ShiftsApi.addMovement(id, body),
    // Expected cash moved with it; refetch rather than patch, so the figure
    // on screen is the server's and never a client-side guess.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-current'] }),
  });
  const moveCash = useCallback<ShiftState['moveCash']>(
    async (body) => {
      if (!shift) return;
      await moveMutation.mutateAsync({ id: shift.id, ...body });
    },
    [shift, moveMutation],
  );
  const retry = useCallback(() => void refetch(), [refetch]);

  const value = useMemo<ShiftState>(
    () => ({
      shift,
      isLoading: enabled && isLoading,
      isError: enabled && isError && !data,
      retry,
      isOpening: openMutation.isPending,
      isClosing: closeMutation.isPending,
      isReporting: reportMutation.isPending,
      openShift,
      closeShift,
      loadReport,
      joinable,
      joinShift,
      tills,
      switchTill,
      setTillStore: setTillStoreId,
      moveCash,
      isMovingCash: moveMutation.isPending,
    }),
    [
      shift,
      enabled,
      isLoading,
      isError,
      data,
      retry,
      moveCash,
      moveMutation.isPending,
      openMutation.isPending,
      closeMutation.isPending,
      reportMutation.isPending,
      openShift,
      closeShift,
      loadReport,
      joinable,
      joinShift,
      tills,
      switchTill,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
