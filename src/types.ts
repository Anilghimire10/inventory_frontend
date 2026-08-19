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

export interface Business {
  id: string;
  name: string;
  type: string;
  salesModel: string;
  currency: string;
  taxEnabled?: boolean;
  taxId?: string | null;
  showTaxIdOnBill?: boolean;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  storeId?: string | null;
  business?: Business;
}

export interface Paginated<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    pages: number;
    revenue?: number;
    todayRevenue?: number;
    todayCount?: number;
  };
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

export interface Tax {
  id: string;
  name: string;
  rate: string;
  isActive: boolean;
  isDefault: boolean;
}

export interface TaxReport {
  taxableAmount: number;
  taxCollected: number;
  grossSales: number;
  byRate: { rate: number; taxableAmount: number; tax: number }[];
}

export interface Product {
  id: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  barcode?: string | null;
  brand?: string | null;
  categories?: { id: string; name: string }[];
  taxId?: string | null;
  tax?: { id: string; name: string; rate: string } | null;
  imageUrl?: string | null;
  expiryDate?: string | null;
  unit: string;
  costPrice: string;
  sellingPrice: string;
  taxRate: string;
  isTaxable: boolean;
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
  // findOne returns the full customer record (phone/email/address), not just id+name.
  customer?: Customer | null;
  items: SaleItem[];
  store?: { id: string; name: string; address?: string | null; phone?: string | null };
  business?: { name: string; currency: string; taxId?: string | null; showTaxIdOnBill?: boolean };
}

export interface Purchase {
  id: string;
  reference?: string | null;
  status: PurchaseStatus;
  subtotal: string;
  tax: string;
  total: string;
  amountPaid: string;
  outstanding?: number;
  receivedAt?: string | null;
  createdAt: string;
  supplier?: { id: string; name: string } | null;
  store?: { id: string; name: string };
  _count?: { items: number };
  items?: PurchaseLine[];
}

export interface CreditInvoice {
  id: string;
  reference: string | null;
  total: number;
  amountPaid: number;
  outstanding?: number;
  status: string;
  createdAt: string;
}

export interface Receivable {
  id: string;
  name: string;
  phone?: string | null;
  balance: number;
  invoices: CreditInvoice[];
}

export interface Payable {
  id: string | null;
  name: string;
  outstanding: number;
  invoices: CreditInvoice[];
}

export interface CreditSummary {
  receivablesTotal: number;
  payablesTotal: number;
  netPosition: number;
  customersOwing: number;
  suppliersOwed: number;
}

export interface AuditEntry {
  id: string;
  createdAt: string;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  summary?: string | null;
  method?: string | null;
  path?: string | null;
  ip?: string | null;
  userName?: string | null;
  user?: { id: string; name: string; role?: UserRole | null } | null;
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
  totalSalesCount: number;
  lowStockCount: number;
  expiringSoonCount: number;
  topProducts: { productId: string; name: string; quantitySold: number }[];
  slowProducts: {
    productId: string;
    name: string;
    quantitySold: number;
    inStock: number;
  }[];
  // Owner-only financial figures + charts (absent for other roles).
  totalSalesTotal?: number;
  inventoryValue?: number;
  salesTrend?: { date: string; total: number; count: number }[];
  hourlyToday?: { hour: number; total: number; count: number }[];
}

export interface ProductAnalytics {
  productId: string;
  name: string;
  quantitySold: number;
  revenue: number;
  cost: number;
  profit: number;
}

export type NotificationType = 'LOW_STOCK' | 'EXPIRING' | 'GENERAL';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationList {
  items: AppNotification[];
  unreadCount: number;
}

export interface Analytics {
  totals: {
    transactions: number;
    grossSales: number;
    netRevenue: number;
    cost: number;
    profit: number;
    margin: number;
    units: number;
  };
  comparison: { revenue: number; orders: number; netRevenue: number; profit: number } | null;
  byProduct: ProductAnalytics[];
  byDay: { date: string; total: number; count: number; units: number }[];
  byCategory: { category: string; revenue: number; units: number; share: number }[];
  byPaymentMethod: { method: PaymentMethod; total: number; count: number; share: number }[];
  hourly: { hour: number; total: number; count: number; units: number }[];
  inventory: {
    value: number;
    stockTurnover: number;
    sellThrough: number;
    deadStockValue: number;
    deadStockPct: number;
  };
  stockMovement: {
    date: string;
    purchases: number;
    sales: number;
    adjustments: number;
    closing: number;
  }[];
  needsAttention: { lowStock: number; unsold: number; expiring: number };
}
