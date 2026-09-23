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
    /** How many sales `revenue` was summed over — not always `total`, which
     *  counts whatever the list is showing, returned and held sales included. */
    revenueCount?: number;
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
  parentId?: string | null;
  variantName?: string | null;
  attributes?: Record<string, string> | null;
  _count?: { variants: number };
  costPrice: string;
  sellingPrice: string;
  taxRate: string;
  isTaxable: boolean;
  isRxRequired: boolean;
  trackBatches: boolean;
  trackSerials: boolean;
  reorderLevel: number;
  isActive: boolean;
  /**
   * On-hand quantity at the requested store. Only returned by
   * `GET /products?storeId=` — the list is scoped to one store, so there is a
   * single figure to report. Decimal(12,3), so it arrives as a string.
   */
  onHandQty?: string;
  /**
   * That store's reorder override when it has one, otherwise `reorderLevel`.
   * Returned alongside `onHandQty` under the same `storeId` condition.
   */
  effectiveReorderLevel?: number;
  /** Only returned by GET /products/:id — one row per store that carries it. */
  stockItems?: { storeId: string; quantity: string }[];
}

export type SerialStatus = 'IN_STOCK' | 'SOLD' | 'RETURNED_TO_SUPPLIER';

/** One physical unit of a serialised product (phone IMEI, appliance serial). */
export interface SerialRecord {
  id: string;
  serialNumber: string;
  status: SerialStatus;
  product: { id: string; name: string; sku?: string | null };
  store: { id: string; name: string } | null;
  sale: {
    id: string;
    receiptNo: string;
    createdAt: string;
    customer: { id: string; name: string; phone?: string | null } | null;
  } | null;
  purchaseId: string | null;
  soldAt: string | null;
  note: string | null;
  updatedAt: string;
}

/**
 * A variant is a real Product row (own SKU/barcode/price/stock) that points
 * back at its parent style via `parentId`. `GET /products/:id/variants`
 * returns full rows shaped like this.
 */
export interface ProductVariant extends Product {
  variantName?: string | null;
  attributes?: Record<string, string> | null;
  /** `quantity` is Decimal(12,3) — a string, exactly as on {@link StockItem}. */
  stockItems: { storeId: string; quantity: string }[];
}

export interface StockItem {
  id: string;
  storeId: string;
  productId: string;
  /** Decimal(12,3) — arrives as a string, so `Number()` it before any arithmetic. */
  quantity: string;
  reorderLevel: number;
  product: { id: string; name: string; sku?: string | null; unit?: string; reorderLevel?: number };
  store?: { id: string; name: string };
  effectiveReorderLevel?: number;
}

export interface StockMovement {
  id: string;
  type: string;
  /**
   * Decimal(12,3) — arrives as a string, so `Number()` it before any
   * arithmetic. Signed: negative is stock out.
   */
  quantity: string;
  reason?: string | null;
  note?: string | null;
  createdAt: string;
  product: { id: string; name: string };
  user?: { id: string; name: string } | null;
  store?: { id: string; name: string };
}

export interface TransferResult {
  reference: string;
  fromStore: { id: string; name: string };
  toStore: { id: string; name: string };
  items: { productId: string; quantity: number }[];
  transferredAt: string;
}

export interface CountSheetLine {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  system: number;
  counted: string;
}

export interface StockTakeVarianceLine {
  productId: string;
  name: string;
  sku: string | null;
  unit: string;
  system: number;
  counted: number;
  variance: number;
}

export interface StockTakeResult {
  storeId: string;
  reference?: string;
  preview?: boolean;
  counted: number;
  adjusted: number;
  lines: StockTakeVarianceLine[];
}

export interface Batch {
  id: string;
  batchNumber?: string | null;
  expiryDate?: string | null;
  /** Decimal(12,3) — arrives as a string, so `Number()` it before any arithmetic. */
  quantity: string;
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
  /** Decimal(12,3) — arrives as a string, so `Number()` it before any arithmetic. */
  quantity: string;
  unitPrice: string;
  discount: string;
  taxRate: string;
  lineTotal: string;
  /** Decimal(12,3) — arrives as a string, so `Number()` it before any arithmetic. */
  returnedQty: string;
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

/** POST /sales/:id/resume — a parked cart, ready to repopulate the POS. */
export interface HeldSaleCart {
  storeId: string;
  customerId: string | null;
  discount: number;
  prescriptionRef?: string | null;
  note?: string | null;
  items: { product: Product; quantity: number; unitPrice?: number; discount?: number }[];
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
  /**
   * True when a store filter is on: what a customer owes is owed to the
   * business, so the figure stays whole rather than being split per branch.
   */
  receivablesAreBusinessWide?: boolean;
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
  /** Decimal(12,3) — arrives as a string, so `Number()` it before any arithmetic. */
  quantity: string;
  /** Decimal(12,3) — arrives as a string, so `Number()` it before any arithmetic. */
  returnedQty: string;
  costPrice: string;
  batchNumber?: string | null;
  expiryDate?: string | null;
  product?: { id: string; name: string; sku?: string | null };
}

/** One low-stock line in a suggested reorder, priced at the last cost paid. */
export interface ReorderSuggestionItem {
  productId: string;
  name: string;
  sku: string | null;
  unit: string;
  onHand: number;
  reorderLevel: number;
  /** Suggested order qty: twice the reorder level, less what is on hand. */
  quantity: number;
  costPrice: number;
  lastPurchasedAt: string | null;
}

/**
 * Low-stock items grouped into one suggested order per (store, supplier).
 * `supplierId` is null for products that have never been purchased, so the
 * server has no supplier to attribute them to.
 */
export interface ReorderSuggestionGroup {
  storeId: string;
  storeName: string;
  supplierId: string | null;
  supplierName: string | null;
  items: ReorderSuggestionItem[];
  total: number;
}

export interface ReturnPurchaseResult {
  purchase: Purchase;
  returnedValue: number;
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

/** Raw Shift row (e.g. GET /shifts history) — amounts as Prisma passes them through: strings. */
export interface Shift {
  id: string;
  storeId: string;
  userId: string;
  openedAt: string;
  closedAt?: string | null;
  openingFloat: string;
  countedCash?: string | null;
  expectedCash?: string | null;
  variance?: string | null;
  note?: string | null;
  user?: { id: string; name: string };
  store?: { id: string; name: string };
  _count?: { sales: number };
}

export interface ShiftTenderTotal {
  method: PaymentMethod;
  count: number;
  amount: number;
}

/**
 * GET /shifts/current, GET /shifts/:id/report, POST /shifts/:id/close — a
 * shift plus its totals, computed live while open or snapshotted at close.
 * Unlike `Shift`, these amounts are plain numbers: the API runs them through
 * Number()/round2() before responding.
 */
export interface ShiftReport extends Omit<Shift, 'countedCash' | 'expectedCash' | 'variance'> {
  isOpen: boolean;
  expectedCash: number;
  countedCash: number | null;
  variance: number | null;
  salesCount: number;
  gross: number;
  discounts: number;
  tax: number;
  refunds: number;
  net: number;
  cashIn: number;
  cashRefunds: number;
  byTender: ShiftTenderTotal[];
}
