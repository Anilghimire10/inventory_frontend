import { api } from '@/lib/api';
import type {
  Analytics,
  AppUser,
  AuthUserLite,
  AuditEntry,
  Batch,
  Business,
  Category,
  CreditSummary,
  Customer,
  Dashboard,
  HeldSaleCart,
  NotificationList,
  Paginated,
  Payable,
  Product,
  ProductVariant,
  Purchase,
  Receivable,
  SessionUser,
  Shift,
  ShiftReport,
  Tax,
  Sale,
  SaleListItem,
  SerialRecord,
  StockItem,
  StockMovement,
  Store,
  Supplier,
  TaxReport,
  TransferResult,
  CountSheetLine,
  StockTakeResult,
  ReturnPurchaseResult,
  ReorderSuggestionGroup,
} from '@/types';

const get = async <T>(url: string, params?: object) =>
  (await api.get<T>(url, { params })).data;
const post = async <T>(url: string, body?: object) =>
  (await api.post<T>(url, body)).data;
const patch = async <T>(url: string, body?: object) =>
  (await api.patch<T>(url, body)).data;
const del = async <T>(url: string) => (await api.delete<T>(url)).data;

export const AuthApi = {
  login: (email: string, password: string) =>
    post<{ accessToken: string; user: AuthUserLite }>('/auth/login', {
      email,
      password,
    }),
  register: (body: {
    businessName: string;
    businessType?: string;
    salesModel?: string;
    currency?: string;
    email: string;
    name: string;
    password: string;
  }) => post<{ message: string; email: string }>('/auth/register', body),
  verifyEmail: (email: string, code: string) =>
    post<{ accessToken: string; user: AuthUserLite }>('/auth/verify-email', {
      email,
      code,
    }),
  resendVerification: (email: string) =>
    post<{ message: string }>('/auth/resend-verification', { email }),
  forgotPassword: (email: string) =>
    post<{ message: string }>('/auth/forgot-password', { email }),
  resetPassword: (email: string, code: string, password: string) =>
    post<{ message: string }>('/auth/reset-password', { email, code, password }),
  /**
   * Server-side record of the sign-out — writes the `auth.logout` audit row.
   * Time-boxed: sign-out awaits it, and a cold or slow server must not hold
   * the user in the app.
   */
  logout: async () => (await api.post<{ message: string }>('/auth/logout', undefined, { timeout: 5000 })).data,
  changePassword: (currentPassword: string, newPassword: string) =>
    post<{ message: string }>('/auth/change-password', {
      currentPassword,
      newPassword,
    }),
  me: () => get<SessionUser>('/auth/me'),
};

export const BusinessApi = {
  get: () => get<Business>('/business'),
  update: (body: object) => patch<Business>('/business', body),
  exportData: () => get<unknown>('/business/export'),
};

export const StoresApi = {
  list: () => get<Store[]>('/stores'),
  create: (body: object) => post<Store>('/stores', body),
  update: (id: string, body: object) => patch<Store>(`/stores/${id}`, body),
  remove: (id: string) => del(`/stores/${id}`),
};

export const CategoriesApi = {
  list: () => get<Category[]>('/categories'),
  create: (body: object) => post<Category>('/categories', body),
  update: (id: string, body: object) => patch<Category>(`/categories/${id}`, body),
  remove: (id: string) => del(`/categories/${id}`),
};

export const TaxesApi = {
  list: () => get<Tax[]>('/taxes'),
  create: (body: object) => post<Tax>('/taxes', body),
  update: (id: string, body: object) => patch<Tax>(`/taxes/${id}`, body),
  remove: (id: string) => del(`/taxes/${id}`),
};

export const ProductsApi = {
  list: (params?: object) => get<Paginated<Product>>('/products', params),
  get: (id: string) => get<Product>(`/products/${id}`),
  byBarcode: (barcode: string) => get<Product>(`/products/barcode/${barcode}`),
  create: (body: object) => post<Product>('/products', body),
  update: (id: string, body: object) => patch<Product>(`/products/${id}`, body),
  remove: (id: string) => del(`/products/${id}`),
  uploadImage: async (file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    return (await api.post<{ imageUrl: string }>('/products/upload-image', fd))
      .data;
  },
  exportAll: () => get<Record<string, unknown>[]>('/products/export'),
  importProducts: (items: Record<string, unknown>[]) =>
    post<{ created: number; updated: number; errors: { row: number; error: string }[] }>(
      '/products/import',
      { items },
    ),
  listVariants: (id: string) => get<ProductVariant[]>(`/products/${id}/variants`),
  generateVariants: (
    id: string,
    body: {
      options: { name: string; values: string[] }[];
      sellingPrice?: number;
      costPrice?: number;
    },
  ) =>
    post<{ created: number; skipped: number; variants: ProductVariant[] }>(
      `/products/${id}/variants`,
      body,
    ),
};

export const NotificationsApi = {
  list: () => get<NotificationList>('/notifications'),
  markRead: (id: string) => post<{ ok: true }>(`/notifications/${id}/read`),
  markAllRead: () => post<{ ok: true }>('/notifications/read-all'),
  dismiss: (id: string) => del<{ ok: true }>(`/notifications/${id}`),
};

export const InventoryApi = {
  stock: (params?: object) => get<Paginated<StockItem>>('/inventory/stock', params),
  lowStock: (storeId?: string) =>
    get<StockItem[]>('/inventory/low-stock', storeId ? { storeId } : undefined),
  expiring: (params?: object) => get<Batch[]>('/inventory/expiring', params),
  movements: (params?: object) =>
    get<Paginated<StockMovement>>('/inventory/movements', params),
  serials: (params?: object) =>
    get<Paginated<SerialRecord>>('/inventory/serials', params),
  adjust: (body: object) => post('/inventory/adjust', body),
  setReorderLevel: (body: object) => post('/inventory/reorder-level', body),
  transfer: (body: {
    fromStoreId: string;
    toStoreId: string;
    note?: string;
    items: { productId: string; quantity: number }[];
  }) => post<TransferResult>('/inventory/transfer', body),
  countSheet: (storeId: string) =>
    get<CountSheetLine[]>('/inventory/count-sheet', { storeId }),
  stockTake: (body: {
    storeId: string;
    preview?: boolean;
    note?: string;
    counts: { productId: string; counted: number }[];
  }) => post<StockTakeResult>('/inventory/stock-take', body),
};

export const SuppliersApi = {
  list: (params?: object) => get<Paginated<Supplier>>('/suppliers', params),
  create: (body: object) => post<Supplier>('/suppliers', body),
  update: (id: string, body: object) => patch<Supplier>(`/suppliers/${id}`, body),
  remove: (id: string) => del(`/suppliers/${id}`),
};

export const PurchasesApi = {
  list: (params?: object) => get<Paginated<Purchase>>('/purchases', params),
  get: (id: string) => get<Purchase>(`/purchases/${id}`),
  create: (body: object) => post<Purchase>('/purchases', body),
  update: (id: string, body: object) => patch<Purchase>(`/purchases/${id}`, body),
  /**
   * Turn a DRAFT into RECEIVED: adds stock, creates batches, updates cost.
   * Serialised lines must carry exactly one distinct serial per unit.
   */
  receive: (
    id: string,
    body?: { items?: { purchaseItemId: string; serials: string[] }[] },
  ) => post<Purchase>(`/purchases/${id}/receive`, body),
  return: (
    id: string,
    body: { note?: string; items: { purchaseItemId: string; quantity: number }[] },
  ) => post<ReturnPurchaseResult>(`/purchases/${id}/return`, body),
  pay: (id: string, amount: number) =>
    post<Purchase>(`/purchases/${id}/pay`, { amount }),
  /** Low-stock items grouped into one suggested order per store + supplier. */
  reorderSuggestions: (storeId?: string) =>
    get<ReorderSuggestionGroup[]>(
      '/purchases/reorder-suggestions',
      storeId ? { storeId } : undefined,
    ),
  /**
   * Raise the suggestions above as DRAFT purchases. The server recomputes them
   * at call time, so what lands can differ from what was last displayed.
   * Omitting `supplierId` drafts every group, including the no-supplier one.
   */
  reorderDrafts: (body: { storeId?: string; supplierId?: string }) =>
    post<Purchase[]>('/purchases/reorder-drafts', body),
};

export const ShiftsApi = {
  open: (body: { storeId?: string; openingFloat: number; note?: string }) =>
    post<Shift>('/shifts/open', body),
  current: () => get<ShiftReport | null>('/shifts/current'),
  report: (id: string) => get<ShiftReport>(`/shifts/${id}/report`),
  close: (id: string, body: { countedCash: number; note?: string }) =>
    post<ShiftReport>(`/shifts/${id}/close`, body),
  list: (params?: object) => get<Paginated<Shift>>('/shifts', params),
};

export const CreditApi = {
  summary: () => get<CreditSummary>('/credit/summary'),
  receivables: () => get<Receivable[]>('/credit/receivables'),
  payables: () => get<Payable[]>('/credit/payables'),
};

export const AuditApi = {
  list: (params?: object) => get<Paginated<AuditEntry>>('/audit', params),
};

export const NotificationsAdminApi = {
  sendLowStockDigest: () =>
    post<{ message: string }>('/notifications/low-stock-digest'),
};

export const SalesApi = {
  list: (params?: object) => get<Paginated<SaleListItem>>('/sales', params),
  get: (id: string) => get<Sale>(`/sales/${id}`),
  create: (body: object) => post<Sale>('/sales', body),
  hold: (body: object) => post<Sale>('/sales/hold', body),
  resume: (id: string) => post<HeldSaleCart>(`/sales/${id}/resume`, {}),
  discardHeld: (id: string) => del(`/sales/${id}`),
  return: (id: string, body: object) =>
    post<{ sale: Sale; refund: number }>(`/sales/${id}/return`, body),
  emailReceipt: (id: string, email?: string) =>
    post<{ message: string }>(`/sales/${id}/email-receipt`, email ? { email } : {}),
};

export const CustomersApi = {
  list: (params?: object) => get<Paginated<Customer>>('/customers', params),
  get: (id: string) => get<Customer>(`/customers/${id}`),
  create: (body: object) => post<Customer>('/customers', body),
  update: (id: string, body: object) => patch<Customer>(`/customers/${id}`, body),
  payCredit: (id: string, amount: number) =>
    post<Customer>(`/customers/${id}/pay-credit`, { amount }),
  remove: (id: string) => del(`/customers/${id}`),
};

export const UsersApi = {
  list: () => get<AppUser[]>('/users'),
  create: (body: object) => post<AppUser>('/users', body),
  update: (id: string, body: object) => patch<AppUser>(`/users/${id}`, body),
  remove: (id: string) => del(`/users/${id}`),
};

export const ReportsApi = {
  dashboard: (storeId?: string) =>
    get<Dashboard>('/reports/dashboard', storeId ? { storeId } : undefined),
  salesSummary: (params?: object) => get<unknown>('/reports/sales-summary', params),
  analytics: (params?: object) => get<Analytics>('/reports/analytics', params),
  taxReport: (params?: object) => get<TaxReport>('/reports/tax', params),
};
