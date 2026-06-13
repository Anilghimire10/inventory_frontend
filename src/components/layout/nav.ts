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
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '@/types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Roles allowed to see this item. Omit = everyone. OWNER always sees all. */
  roles?: UserRole[];
}

// Roles per page mirror the backend's @Roles guards. OWNER always sees all.
const CATALOG: UserRole[] = ['OWNER', 'MANAGER', 'STOCK_KEEPER'];
const TILL: UserRole[] = ['OWNER', 'MANAGER', 'CASHIER'];
const ADMIN: UserRole[] = ['OWNER', 'MANAGER'];

export const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, roles: ADMIN },
  { to: '/pos', label: 'Point of Sale', icon: ShoppingCart, roles: TILL },
  { to: '/sales', label: 'Sales', icon: Receipt, roles: TILL },
  { to: '/products', label: 'Products', icon: Package, roles: CATALOG },
  { to: '/categories', label: 'Categories', icon: Tags, roles: CATALOG },
  { to: '/inventory', label: 'Inventory', icon: Boxes, roles: CATALOG },
  { to: '/suppliers', label: 'Suppliers', icon: Truck, roles: CATALOG },
  { to: '/purchases', label: 'Purchases', icon: ClipboardList, roles: CATALOG },
  { to: '/customers', label: 'Customers', icon: Users, roles: TILL },
  { to: '/users', label: 'Staff', icon: UserCog, roles: ADMIN },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ADMIN },
];

export function canSee(item: NavItem, role: UserRole): boolean {
  if (!item.roles) return true;
  if (role === 'OWNER') return true;
  return item.roles.includes(role);
}

/** Whether a role may view a given route path (for direct-URL access). */
export function canAccessPath(role: UserRole, pathname: string): boolean {
  const item = NAV.find((i) =>
    i.to === '/' ? pathname === '/' : pathname.startsWith(i.to),
  );
  // Unknown paths (not in nav) are left to normal routing.
  return item ? canSee(item, role) : true;
}
