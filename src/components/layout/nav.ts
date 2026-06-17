import {
  LayoutDashboard,
  BarChart3,
  ShoppingCart,
  Package,
  Tags,
  Boxes,
  Truck,
  ClipboardList,
  Receipt,
  Users,
  UserCog,
  Settings,
  CreditCard,
  ScrollText,
  Percent,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '@/types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles?: UserRole[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Roles per page mirror the backend's @Roles guards. OWNER always sees all.
const CATALOG: UserRole[] = ['OWNER', 'MANAGER', 'STOCK_KEEPER'];
const TILL: UserRole[] = ['OWNER', 'MANAGER', 'CASHIER'];
const ADMIN: UserRole[] = ['OWNER', 'MANAGER'];

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/analytics', label: 'Analytics', icon: BarChart3, roles: ADMIN },
    ],
  },
  {
    label: 'Sales',
    items: [
      { to: '/pos', label: 'Point of Sale', icon: ShoppingCart, roles: TILL },
      { to: '/sales', label: 'Sales', icon: Receipt, roles: TILL },
      { to: '/customers', label: 'Customers', icon: Users, roles: TILL },
      { to: '/credit', label: 'Credit & Invoices', icon: CreditCard, roles: ADMIN },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { to: '/products', label: 'Products', icon: Package, roles: CATALOG },
      { to: '/categories', label: 'Categories', icon: Tags, roles: CATALOG },
      { to: '/inventory', label: 'Stock', icon: Boxes, roles: CATALOG },
      { to: '/suppliers', label: 'Suppliers', icon: Truck, roles: CATALOG },
      { to: '/purchases', label: 'Purchases', icon: ClipboardList, roles: CATALOG },
      { to: '/taxes', label: 'Taxes', icon: Percent, roles: ADMIN },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/users', label: 'Staff', icon: UserCog, roles: ADMIN },
      { to: '/activity', label: 'Activity Log', icon: ScrollText, roles: ADMIN },
      { to: '/settings', label: 'Settings', icon: Settings, roles: ADMIN },
    ],
  },
];

const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export function canSee(item: NavItem, role: UserRole): boolean {
  return !item.roles || item.roles.includes(role) || role === 'OWNER';
}

/** Whether a role may view a given route path (for direct-URL access). */
export function canAccessPath(role: UserRole, pathname: string): boolean {
  const item = NAV.find((i) =>
    i.to === '/' ? pathname === '/' : pathname.startsWith(i.to),
  );
  return item ? canSee(item, role) : true;
}
