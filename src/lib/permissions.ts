import type { UserRole } from '@/types';

const isAdmin = (r: UserRole) => r === 'OWNER' || r === 'MANAGER';

/**
 * Action-level permissions, mirroring the backend's @Roles guards.
 * Page-level visibility is handled by the sidebar nav + route guard;
 * these gate buttons/actions within a page a role CAN open.
 */
export const can = {
  // Catalog: stock keepers can create/edit, but only admins can delete.
  editCatalog: (r: UserRole) => isAdmin(r) || r === 'STOCK_KEEPER',
  deleteCatalog: (r: UserRole) => isAdmin(r),
  // Inventory adjustments
  adjustStock: (r: UserRole) => isAdmin(r) || r === 'STOCK_KEEPER',
  // Selling
  sell: (r: UserRole) => isAdmin(r) || r === 'CASHIER',
  // People
  manageUsers: (r: UserRole) => isAdmin(r),
  deleteCustomers: (r: UserRole) => isAdmin(r),
  // Credit & invoices, business settings, financial reports — management.
  manageCredit: (r: UserRole) => isAdmin(r),
  // Paying a supplier. A stock keeper's purchases are recorded on credit.
  paySuppliers: (r: UserRole) => isAdmin(r),
  manageBusiness: (r: UserRole) => isAdmin(r),
  viewAnalytics: (r: UserRole) => isAdmin(r),
  viewActivityLog: (r: UserRole) => isAdmin(r),
  viewFinancials: (r: UserRole) => isAdmin(r),
};
