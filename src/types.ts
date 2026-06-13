// Shared types mirroring the API responses.

export type UserRole = 'OWNER' | 'MANAGER' | 'CASHIER' | 'STOCK_KEEPER';
export type BusinessType = 'GROCERY' | 'PHARMACY' | 'RETAIL' | 'OTHER';
export type PaymentMethod = 'CASH' | 'CARD' | 'MOBILE' | 'CREDIT' | 'MIXED';
export type SaleStatus =
  | 'COMPLETED'
  | 'HELD'
  | 'RETURNED'
  | 'PARTIALLY_RETURNED';
export type PurchaseStatus = 'DRAFT' | 'ORDERED' | 'RECEIVED' | 'CANCELLED';
export type AdjustmentReason =
  | 'DAMAGE'
  | 'THEFT'
  | 'COUNT_CORRECTION'
  | 'EXPIRED'
  | 'OTHER';

export interface AuthUserLite {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface Paginated<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; pages: number };
}

export interface Store {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  isActive: boolean;
}

export interface Category {
  id: string;
  name: string;
  parentId?: string | null;
  _count?: { products: number };
}

export interface Product {
  id: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  barcode?: string | null;
  brand?: string | null;
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
  unit: string;
  costPrice: string;
  sellingPrice: string;
  taxRate: string;
  isRxRequired: boolean;
  trackBatches: boolean;
  reorderLevel: number;
  isActive: boolean;
}

export interface StockItem {
  id: string;
  storeId: string;
  productId: string;
  quantity: number;
  reorderLevel: number;
  product: { id: string; name: string; sku?: string | null; unit?: string; reorderLevel?: number };
  store?: { id: string; name: string };
  effectiveReorderLevel?: number;
}

export interface StockMovement {
  id: string;
  type: string;
  quantity: number;
  reason?: string | null;
  note?: string | null;
  createdAt: string;
  product: { id: string; name: string };
  user?: { id: string; name: string } | null;
}

export interface Batch {
  id: string;
  batchNumber?: string | null;
  expiryDate?: string | null;
  quantity: number;
  product: { id: string; name: string; sku?: string | null };
  store?: { id: string; name: string };
}

export interface Supplier {
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  isActive: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  creditBalance: string;
  sales?: SaleListItem[];
}

export interface SaleItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: string;
  discount: string;
  taxRate: string;
  lineTotal: string;
  returnedQty: number;
}

export interface SaleListItem {
  id: string;
  receiptNo: string;
  total: string;
  status: SaleStatus;
  createdAt: string;
  paymentMethod?: PaymentMethod;
  customer?: { id: string; name: string } | null;
  user?: { id: string; name: string } | null;
  _count?: { items: number };
}

export interface Sale extends SaleListItem {
  subtotal: string;
  discount: string;
  tax: string;
  amountPaid: string;
  prescriptionRef?: string | null;
  note?: string | null;
  items: SaleItem[];
  store?: { id: string; name: string; address?: string | null; phone?: string | null };
  business?: { name: string; currency: string; taxId?: string | null };
}

export interface Purchase {
  id: string;
  reference?: string | null;
  status: PurchaseStatus;
  subtotal: string;
  tax: string;
  total: string;
  receivedAt?: string | null;
  createdAt: string;
  supplier?: { id: string; name: string } | null;
  store?: { id: string; name: string };
  _count?: { items: number };
  items?: PurchaseLine[];
}

export interface PurchaseLine {
  id: string;
  productId: string;
  quantity: number;
  costPrice: string;
  batchNumber?: string | null;
  expiryDate?: string | null;
  product?: { id: string; name: string; sku?: string | null };
}

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  storeId?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Dashboard {
  todaySalesTotal: number;
  todaySalesCount: number;
  lowStockCount: number;
  expiringSoonCount: number;
  inventoryValue: number;
  topProducts: { productId: string; name: string; quantitySold: number }[];
}

export interface ProductAnalytics {
  productId: string;
  name: string;
  quantitySold: number;
  revenue: number;
  cost: number;
  profit: number;
}

export interface Analytics {
  totals: {
    transactions: number;
    grossSales: number;
    netRevenue: number;
    cost: number;
    profit: number;
    margin: number;
  };
  byProduct: ProductAnalytics[];
  byDay: { date: string; total: number; count: number }[];
  byPaymentMethod: { method: PaymentMethod; total: number; count: number }[];
}
