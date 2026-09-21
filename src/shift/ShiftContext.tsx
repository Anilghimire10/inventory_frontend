'use client';
import { createContext, useContext, useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { useStoreScope } from '@/store/StoreContext';
import { ShiftsApi } from '@/api';
import type { ShiftReport } from '@/types';

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
}

const Ctx = createContext<ShiftState>(null as never);
export const useShift = () => useContext(Ctx);

/** Roles the backend's /shifts endpoints accept — a STOCK_KEEPER never touches a till. */
const TILL_ROLES = ['OWNER', 'MANAGER', 'CASHIER'];

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
  const shiftKey = useMemo(() => ['shift-current', storeId], [storeId]);
  const { data, isLoading } = useQuery({
    queryKey: shiftKey,
    queryFn: () => ShiftsApi.current(storeId || undefined),
    enabled,
    staleTime: 15_000,
  });
  const shift = data ?? null;

  const openMutation = useMutation({
    mutationFn: (vars: { openingFloat: number; note?: string; storeId?: string }) =>
      ShiftsApi.open(vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-current'] }),
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
      qc.invalidateQueries({ queryKey: ['shift-history'] });
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
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
