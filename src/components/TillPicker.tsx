'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShiftsApi } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { readJoinedShift } from '@/shift/ShiftContext';
import type { PaymentMethod } from '@/types';
import { Field } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatTime } from '@/lib/format';
import { defaultTill, needsTillChoice, tillName } from '@/lib/tills';

const MANAGEMENT = ['OWNER', 'MANAGER'];

/**
 * Which till cash taken against a khata goes into -- or, on a return, which
 * one a cash refund comes out of.
 *
 * An owner or manager works on whichever till they chose -- their own, a
 * cashier's, or another owner's or manager's -- and cash moved here has to
 * land in that same drawer, or both drawers count wrong at close. So with
 * more than one till open, this asks, starting from the till this device is
 * working on in the POS (else their own). With one open there is nothing to
 * choose: the API books it there.
 *
 * Only cash matters: card and QR payments never touch a drawer.
 */
export function useTillChoice(storeId: string, method: PaymentMethod, active: boolean) {
  const { user } = useAuth();
  const eligible =
    active && method === 'CASH' && !!storeId && !!user && MANAGEMENT.includes(user.role);

  const { data: open, isError } = useQuery({
    queryKey: ['shift-open', storeId],
    queryFn: () => ShiftsApi.openAtStore(storeId),
    enabled: eligible,
    staleTime: 15_000,
  });

  const needsChoice = eligible && !!open && needsTillChoice(open);
  // Remembered with the store it was made at, and only used while that till
  // is still open there: the screen outlives one refund, and a till picked
  // for a sale at one branch -- or one closed since -- must not carry over.
  const [picked, setPicked] = useState<{ storeId: string; id: string } | null>(null);
  const pickedHere =
    picked && picked.storeId === storeId && open?.some((t) => t.id === picked.id) ? picked.id : null;
  // Picked here, else the till this device is on in the POS.
  const remembered = storeId ? readJoinedShift(storeId) : null;
  const shiftId = needsChoice ? (pickedHere ?? defaultTill(open!, remembered)) : null;
  // The list of tills is still on its way: whether to ask isn't known yet,
  // so the money shouldn't move until it is.
  const pending = eligible && open === undefined && !isError;

  return {
    tills: needsChoice ? open! : [],
    needsChoice,
    shiftId,
    pending,
    setShiftId: (id: string | null) => setPicked(id ? { storeId, id } : null),
  };
}

export function TillPicker({
  choice,
  label = 'Cash goes into',
}: {
  choice: ReturnType<typeof useTillChoice>;
  label?: string;
}) {
  if (!choice.needsChoice) return null;
  return (
    <Field label={label}>
      <Select
        required
        value={choice.shiftId ?? ''}
        onChange={(e) => choice.setShiftId(e.target.value || null)}
      >
        <option value="">Choose a till…</option>
        {choice.tills.map((t) => (
          <option key={t.id} value={t.id}>
            {tillName(t)} (opened {formatTime(t.openedAt)})
          </option>
        ))}
      </Select>
    </Field>
  );
}
