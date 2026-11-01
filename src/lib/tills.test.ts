import { describe, expect, it } from 'vitest';
import { defaultTill, joinedWithoutChoosing, needsTillChoice, tillName } from './tills';
import type { OpenShiftSummary, UserRole } from '@/types';

const till = (id: string, name: string, role: UserRole, isOwnShift = false): OpenShiftSummary => ({
  id,
  openedAt: '2026-10-08T04:00:00.000Z',
  openingFloat: 1000,
  openedBy: { id: `u-${id}`, name, role },
  salesCount: 0,
  isOwnShift,
});

const mine = till('mine', 'Ram', 'OWNER', true);
const cashier = till('cashier', 'Hari', 'CASHIER');
const otherOwner = till('owner2', 'Sita', 'OWNER');

describe('tillName', () => {
  it('calls your own till yours', () => {
    expect(tillName(mine)).toBe('My till');
  });
  it('names whose till it is, cashier or another owner', () => {
    expect(tillName(cashier)).toBe('Hari’s till · Cashier');
    expect(tillName(otherOwner)).toBe('Sita’s till · Owner');
  });
  it('leads with the counter when the till is on one', () => {
    expect(tillName({ ...cashier, counter: { id: 'c1', name: 'Counter 1' } })).toBe('Counter 1 · Hari’s till · Cashier');
    expect(tillName({ ...mine, counter: { id: 'c2', name: 'Counter 2' } })).toBe('Counter 2 · My till');
  });
  it('still reads without a role', () => {
    expect(tillName({ isOwnShift: false, openedBy: { id: 'x', name: 'Gita' } })).toBe('Gita’s till');
  });
});

describe('needsTillChoice', () => {
  it('asks only when there is more than one drawer the cash could go to', () => {
    expect(needsTillChoice([])).toBe(false);
    expect(needsTillChoice([cashier])).toBe(false);
    expect(needsTillChoice([cashier, otherOwner])).toBe(true);
    // Your own and someone else's: two drawers, so it asks.
    expect(needsTillChoice([mine, cashier])).toBe(true);
  });
});

describe('defaultTill', () => {
  it('starts from the till this device is working on in the POS', () => {
    expect(defaultTill([mine, cashier, otherOwner], 'cashier')).toBe('cashier');
    expect(defaultTill([mine, cashier, otherOwner], 'owner2')).toBe('owner2');
  });
  it('falls back to your own when the device is on yours (nothing remembered)', () => {
    expect(defaultTill([mine, cashier], null)).toBe('mine');
  });
  it('falls back to your own when the remembered till has since closed', () => {
    expect(defaultTill([mine, cashier], 'closed-one')).toBe('mine');
  });
  it('leaves the choice to the person with no till of their own and none remembered', () => {
    expect(defaultTill([cashier, otherOwner], null)).toBeNull();
  });
});

describe('joinedWithoutChoosing', () => {
  it('treats the server putting an owner on someone else’s till as no choice yet', () => {
    expect(joinedWithoutChoosing(true, null, { isOwnShift: false })).toBe(true);
  });
  it('is a choice once the device remembers one', () => {
    expect(joinedWithoutChoosing(true, 'cashier', { isOwnShift: false })).toBe(false);
  });
  it('never applies to your own till, to no till, or to a cashier', () => {
    expect(joinedWithoutChoosing(true, null, { isOwnShift: true })).toBe(false);
    expect(joinedWithoutChoosing(true, null, null)).toBe(false);
    expect(joinedWithoutChoosing(false, null, { isOwnShift: false })).toBe(false);
  });
});
