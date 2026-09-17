import { describe, expect, it } from 'vitest';
import { can } from './permissions';
import type { UserRole } from '@/types';

const ROLES: UserRole[] = ['OWNER', 'MANAGER', 'CASHIER', 'STOCK_KEEPER'];

/**
 * These mirror the backend's @Roles guards. If a guard moves on the server,
 * one of these should fail rather than the UI quietly offering a button that
 * 403s — or quietly hiding one the role is allowed to use.
 */
describe('can', () => {
  it('lets an owner do everything', () => {
    for (const [name, check] of Object.entries(can)) {
      expect(check('OWNER'), name).toBe(true);
    }
  });

  it('gives stock keepers the catalog but not deletion or money', () => {
    expect(can.editCatalog('STOCK_KEEPER')).toBe(true);
    expect(can.adjustStock('STOCK_KEEPER')).toBe(true);
    expect(can.deleteCatalog('STOCK_KEEPER')).toBe(false);
    expect(can.viewFinancials('STOCK_KEEPER')).toBe(false);
    expect(can.sell('STOCK_KEEPER')).toBe(false);
  });

  it('gives cashiers the till but nothing management-level', () => {
    expect(can.sell('CASHIER')).toBe(true);
    expect(can.editCatalog('CASHIER')).toBe(false);
    expect(can.manageUsers('CASHIER')).toBe(false);
    expect(can.manageCredit('CASHIER')).toBe(false);
    expect(can.viewAnalytics('CASHIER')).toBe(false);
    expect(can.viewFinancials('CASHIER')).toBe(false);
  });

  it('treats a manager as an admin throughout', () => {
    for (const [name, check] of Object.entries(can)) {
      expect(check('MANAGER'), name).toBe(true);
    }
  });

  it('returns a boolean for every role, never undefined', () => {
    for (const [name, check] of Object.entries(can)) {
      for (const r of ROLES) expect(typeof check(r), `${name}/${r}`).toBe('boolean');
    }
  });
});
