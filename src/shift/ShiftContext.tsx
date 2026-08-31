'use client';
import { createContext, useContext, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { ShiftsApi } from '@/api';
import type { ShiftReport } from '@/types';

interface ShiftState {
  shift: ShiftReport | null;
  isLoading: boolean;
  isOpening: boolean;
  isClosing: boolean;
  openShift: (openingFloat: number, note?: string) => Promise<void>;
  closeShift: (countedCash: number, note?: string) => Promise<ShiftReport | null>;
}

const Ctx = createContext<ShiftState>(null as never);
export const useShift = () => useContext(Ctx);

/** Roles the backend's /shifts endpoints accept — a STOCK_KEEPER never touches a till. */
const TILL_ROLES = ['OWNER', 'MANAGER', 'CASHIER'];

export function ShiftProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const enabled = !!user && TILL_ROLES.includes(user.role);

  const { data, isLoading } = useQuery({
    queryKey: ['shift-current'],
    queryFn: ShiftsApi.current,
    enabled,
    staleTime: 15_000,
  });
  const shift = data ?? null;

  const openMutation = useMutation({
    mutationFn: (vars: { openingFloat: number; note?: string }) => ShiftsApi.open(vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-current'] }),
  });
  const openShift = useCallback(
    async (openingFloat: number, note?: string) => {
      await openMutation.mutateAsync({ openingFloat, note });
    },
    [openMutation],
  );

  const closeMutation = useMutation({
    mutationFn: (vars: { id: string; countedCash: number; note?: string }) =>
      ShiftsApi.close(vars.id, { countedCash: vars.countedCash, note: vars.note }),
    onSuccess: () => {
      qc.setQueryData(['shift-current'], null);
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

  return (
    <Ctx.Provider
      value={{
        shift,
        isLoading: enabled && isLoading,
        isOpening: openMutation.isPending,
        isClosing: closeMutation.isPending,
        openShift,
        closeShift,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
