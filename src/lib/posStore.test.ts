import { describe, expect, it } from 'vitest';
import { resolvePosStore } from './posStore';

const A = 'store-a';
const B = 'store-b';
const BOTH = [A, B];

describe('resolvePosStore', () => {
  describe('an open shift pins the till', () => {
    it('wins over everything else', () => {
      // Sales are stamped with the shift; its Z report reconciles that
      // store's drawer, so the two must not diverge.
      expect(
        resolvePosStore({
          role: 'OWNER',
          assignedStoreId: A,
          chosenStoreId: A,
          openShiftStoreId: B,
          activeStoreIds: BOTH,
        }),
      ).toEqual({ storeId: B, canSwitch: false, lockedBy: 'shift' });
    });

    it('pins even a store that has since been deactivated', () => {
      // The shift is already open against it; refusing to name it would leave
      // the till with no store at all mid-session.
      expect(
        resolvePosStore({
          role: 'MANAGER',
          openShiftStoreId: 'gone',
          activeStoreIds: BOTH,
        }),
      ).toEqual({ storeId: 'gone', canSwitch: false, lockedBy: 'shift' });
    });
  });

  describe('single-store business', () => {
    it('uses the only store and offers no picker', () => {
      expect(resolvePosStore({ role: 'CASHIER', activeStoreIds: [A] })).toEqual({
        storeId: A,
        canSwitch: false,
        lockedBy: 'only-store',
      });
    });

    it('resolves a store even when the user has none assigned', () => {
      // This is the case that used to fail checkout outright with
      // "No store specified for this sale".
      expect(
        resolvePosStore({ role: 'CASHIER', assignedStoreId: null, activeStoreIds: [A] }),
      ).toEqual({ storeId: A, canSwitch: false, lockedBy: 'only-store' });
    });

    it('reports no store when the business has none active', () => {
      expect(resolvePosStore({ role: 'OWNER', activeStoreIds: [] }).storeId).toBeNull();
    });
  });

  describe('cashiers are pinned to their assigned store', () => {
    it('cannot switch', () => {
      expect(
        resolvePosStore({ role: 'CASHIER', assignedStoreId: B, activeStoreIds: BOTH }),
      ).toEqual({ storeId: B, canSwitch: false, lockedBy: 'role' });
    });

    it('ignores a chosen store', () => {
      expect(
        resolvePosStore({
          role: 'CASHIER',
          assignedStoreId: B,
          chosenStoreId: A,
          activeStoreIds: BOTH,
        }).storeId,
      ).toBe(B);
    });

    it('may pick when they have no store assigned, or it was deactivated', () => {
      // Otherwise they cannot sell at all.
      const none = resolvePosStore({
        role: 'CASHIER',
        assignedStoreId: null,
        activeStoreIds: BOTH,
      });
      expect(none).toEqual({ storeId: null, canSwitch: true, lockedBy: null });

      const stale = resolvePosStore({
        role: 'CASHIER',
        assignedStoreId: 'deactivated',
        activeStoreIds: BOTH,
      });
      expect(stale.canSwitch).toBe(true);
      expect(stale.storeId).toBeNull();
    });
  });

  describe('owners and managers may switch', () => {
    it('defaults to their assigned store', () => {
      expect(
        resolvePosStore({ role: 'MANAGER', assignedStoreId: A, activeStoreIds: BOTH }),
      ).toEqual({ storeId: A, canSwitch: true, lockedBy: null });
    });

    it('honours what they picked', () => {
      expect(
        resolvePosStore({
          role: 'OWNER',
          assignedStoreId: A,
          chosenStoreId: B,
          activeStoreIds: BOTH,
        }).storeId,
      ).toBe(B);
    });

    it('falls back when the pick is no longer sellable', () => {
      expect(
        resolvePosStore({
          role: 'OWNER',
          assignedStoreId: A,
          chosenStoreId: 'deactivated',
          activeStoreIds: BOTH,
        }).storeId,
      ).toBe(A);
    });

    it('asks them to choose when nothing resolves', () => {
      expect(
        resolvePosStore({ role: 'OWNER', assignedStoreId: null, activeStoreIds: BOTH }),
      ).toEqual({ storeId: null, canSwitch: true, lockedBy: null });
    });
  });

  it('never returns a store that cannot take sales, except a shift-pinned one', () => {
    for (const role of ['OWNER', 'MANAGER', 'CASHIER'] as const) {
      const r = resolvePosStore({
        role,
        assignedStoreId: 'deactivated',
        chosenStoreId: 'deactivated',
        activeStoreIds: BOTH,
      });
      expect(r.storeId === null || BOTH.includes(r.storeId), role).toBe(true);
    }
  });
});
