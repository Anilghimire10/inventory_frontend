import type { UserRole } from '@/types';

/**
 * Which store the till sells from.
 *
 * This has to be explicit. The POS used to send no `storeId` at all, so the
 * server fell back to the cashier's assigned store (`sales.service.ts`) while
 * the grid showed stock summed across *every* store — a cashier at one branch
 * saw another branch's units and sold them out of their own.
 */
export interface PosStoreResolution {
  /** The store to sell from. Null means the user must pick one before selling. */
  storeId: string | null;
  /** Whether a picker should be offered right now. */
  canSwitch: boolean;
  /** Why it is fixed, so the UI can say so. Null when `canSwitch`. */
  lockedBy: 'shift' | 'role' | 'only-store' | null;
}

const isAdmin = (r: UserRole) => r === 'OWNER' || r === 'MANAGER';

export function resolvePosStore(opts: {
  role: UserRole;
  /** The user's default store (`User.storeId`), which may be unset. */
  assignedStoreId?: string | null;
  /** Store of the currently open shift, if any. */
  openShiftStoreId?: string | null;
  /** What the user picked this session. */
  chosenStoreId?: string | null;
  /** Ids of the stores that may take new sales — active ones. */
  activeStoreIds: readonly string[];
}): PosStoreResolution {
  const { role, assignedStoreId, openShiftStoreId, chosenStoreId, activeStoreIds } = opts;

  // An open shift pins the till. Sales are stamped with the shift, and its Z
  // report reconciles that store's drawer — selling from a different store
  // under the same shift would reconcile cash against another store's stock.
  if (openShiftStoreId) {
    return { storeId: openShiftStoreId, canSwitch: false, lockedBy: 'shift' };
  }

  // Only a store that can still take stock movements is sellable, so a store
  // deactivated under a cashier's feet does not silently keep taking sales.
  const assigned =
    assignedStoreId && activeStoreIds.includes(assignedStoreId) ? assignedStoreId : null;

  // Nothing to choose between.
  if (activeStoreIds.length <= 1) {
    return {
      storeId: assigned ?? activeStoreIds[0] ?? null,
      canSwitch: false,
      lockedBy: 'only-store',
    };
  }

  // A cashier stands at one till, so switching is only ever a mistake — unless
  // they have no store assigned, in which case picking is the only way they can
  // sell at all.
  const mayChoose = isAdmin(role) || !assigned;
  if (!mayChoose) {
    return { storeId: assigned, canSwitch: false, lockedBy: 'role' };
  }

  const chosen = chosenStoreId && activeStoreIds.includes(chosenStoreId) ? chosenStoreId : null;
  return { storeId: chosen ?? assigned, canSwitch: true, lockedBy: null };
}
