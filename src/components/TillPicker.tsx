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

const MANAGEMENT = ['OWNER', 'MANAGER'];

/**
 * Which till cash taken against a khata goes into.
 *
 * The API works it out on its own in every case but one: an owner or manager
 * with no till of their own, at a store with more than one open. Then any
 * guess could be the wrong drawer, so it books the money to none and that
 * drawer counts long at close. This asks in exactly that case -- defaulting to
 * the till this device joined in the POS -- and stays silent otherwise.
 *
 * Only cash matters: card and QR payments never touch a drawer.
 */
export function useTillChoice(storeId: string, method: PaymentMethod, active: boolean) {
  const { user } = useAuth();
  const eligible =
    active && method === 'CASH' && !!storeId && !!user && MANAGEMENT.includes(user.role);

  const { data: open } = useQuery({
    queryKey: ['shift-open', storeId],
    queryFn: () => ShiftsApi.openAtStore(storeId),
    enabled: eligible,
    staleTime: 15_000,
  });

  const needsChoice = eligible && !!open && open.length > 1 && !open.some((s) => s.isOwnShift);
  const [picked, setPicked] = useState<string | null>(null);
  // Picked in this dialog, else the POS's till on this device if still open.
  const remembered = storeId ? readJoinedShift(storeId) : null;
  const shiftId = needsChoice
    ? (picked ?? (open!.some((s) => s.id === remembered) ? remembered : null))
    : null;

  return { tills: needsChoice ? open! : [], needsChoice, shiftId, setShiftId: setPicked };
}

export function TillPicker({
  choice,
}: {
  choice: ReturnType<typeof useTillChoice>;
}) {
  if (!choice.needsChoice) return null;
  return (
    <Field label="Cash goes into">
      <Select
        required
        value={choice.shiftId ?? ''}
        onChange={(e) => choice.setShiftId(e.target.value || null)}
      >
        <option value="">Choose a till…</option>
        {choice.tills.map((t) => (
          <option key={t.id} value={t.id}>
            {t.openedBy.name}&apos;s till (opened {formatTime(t.openedAt)})
          </option>
        ))}
      </Select>
    </Field>
  );
}
