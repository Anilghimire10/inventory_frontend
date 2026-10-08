import type { OpenShiftSummary, UserRole } from '@/types';

/**
 * The rules for which till an owner or manager is working on, shared by the
 * POS and by the screens that move cash away from it (refunds on the Sales
 * page, credit payments on Credit and Customers).
 *
 * An owner or manager chooses: work on a till that is already open -- a
 * cashier's, or another owner's or manager's -- or open their own. The choice
 * belongs to the device (see `ShiftContext`), and every screen on that device
 * books cash to the same drawer unless the person picks another.
 */

const ROLE_WORD: Partial<Record<UserRole, string>> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  CASHIER: 'Cashier',
};

/** "My till", or "Sita’s till · Owner": whose drawer it is, in words. */
export function tillName(t: Pick<OpenShiftSummary, 'isOwnShift' | 'openedBy'>): string {
  if (t.isOwnShift) return 'My till';
  const role = t.openedBy.role ? ROLE_WORD[t.openedBy.role] : undefined;
  return `${t.openedBy.name}’s till${role ? ` · ${role}` : ''}`;
}

/**
 * Cash moved off the POS names its till whenever there is more than one it
 * could go to. With one open, that drawer is the only answer and the server
 * finds it on its own.
 */
export const needsTillChoice = (open: readonly OpenShiftSummary[]) => open.length > 1;

/**
 * The till to offer first: the one this device is working on in the POS if
 * it is still open, else the person's own, else none -- they pick.
 *
 * `remembered` is the device's choice of someone else's till; working on
 * one's own is stored as no choice at all, which is why "own" is the fallback.
 */
export function defaultTill(
  open: readonly OpenShiftSummary[],
  remembered: string | null,
): string | null {
  if (remembered && open.some((t) => t.id === remembered)) return remembered;
  return open.find((t) => t.isOwnShift)?.id ?? null;
}

/**
 * The server put an owner or manager onto someone else's till without being
 * asked -- it does that when exactly one is open and nothing was named. The
 * POS treats that as no choice yet, and asks: work on it, or open your own.
 */
export const joinedWithoutChoosing = (
  canChoose: boolean,
  remembered: string | null,
  shift: { isOwnShift?: boolean } | null | undefined,
) => canChoose && !remembered && !!shift && shift.isOwnShift === false;
