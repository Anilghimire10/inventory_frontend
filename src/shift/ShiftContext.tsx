'use client';
import { createContext, useContext, useState, useCallback } from 'react';
import { useAuth } from '@/auth/AuthContext';
import {
  type Shift,
  loadCurrentShift,
  saveCurrentShift,
  loadShiftHistory,
  appendShiftHistory,
  tallySale,
} from '@/lib/shift';
import type { PaymentMethod } from '@/types';

interface ShiftState {
  shift: Shift | null;
  history: Shift[];
  openShift: (openingFloat: number, note?: string) => void;
  closeShift: (countedCash: number, note?: string) => Shift | null;
  recordSale: (sale: { total: number; amountPaid: number; tender: PaymentMethod }) => void;
}

const Ctx = createContext<ShiftState>(null as never);
export const useShift = () => useContext(Ctx);

export function ShiftProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const businessId = user?.business?.id ?? 'default';
  const storeId = user?.storeId ?? 'default';

  // The (app) layout only mounts this provider once `user` has resolved, so
  // reading localStorage in the lazy initializer (once, on first render) is
  // safe -- no hydration flash, no effect needed to sync it in afterward.
  const [shift, setShift] = useState<Shift | null>(() => loadCurrentShift(businessId, storeId));
  const [history, setHistory] = useState<Shift[]>(() => loadShiftHistory(businessId));

  const openShift = useCallback(
    (openingFloat: number, note?: string) => {
      if (!user) return;
      const next: Shift = {
        id: `shift_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        storeId,
        openedByUserId: user.id,
        openedByName: user.name,
        openedAt: new Date().toISOString(),
        openingFloat,
        note,
        salesCount: 0,
        grossSales: 0,
        cashSales: 0,
        cardSales: 0,
        mobileSales: 0,
        creditSales: 0,
      };
      setShift(next);
      saveCurrentShift(businessId, storeId, next);
    },
    [user, businessId, storeId],
  );

  const recordSale = useCallback(
    (sale: { total: number; amountPaid: number; tender: PaymentMethod }) => {
      setShift((cur) => {
        if (!cur) return cur;
        const next = tallySale(cur, sale);
        saveCurrentShift(businessId, storeId, next);
        return next;
      });
    },
    [businessId, storeId],
  );

  const closeShift = useCallback(
    (countedCash: number, note?: string): Shift | null => {
      if (!shift) return null;
      const expectedCash = shift.openingFloat + shift.cashSales;
      const closed: Shift = {
        ...shift,
        closedAt: new Date().toISOString(),
        countedCash,
        expectedCash,
        variance: Math.round((countedCash - expectedCash) * 100) / 100,
        note: note || shift.note,
      };
      appendShiftHistory(businessId, closed);
      saveCurrentShift(businessId, storeId, null);
      setShift(null);
      setHistory((h) => [closed, ...h]);
      return closed;
    },
    [shift, businessId, storeId],
  );

  return (
    <Ctx.Provider value={{ shift, history, openShift, closeShift, recordSale }}>
      {children}
    </Ctx.Provider>
  );
}
