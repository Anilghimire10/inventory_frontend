import { api } from '@/lib/api';
import type { BusinessSetup, CreatePaymentClaimBody, PaymentClaim,
  SupplierRefund,
  ReturnQuote,
  ReturnResult,
  Analytics,
  AppUser,
  AuthUserLite,
  AuditEntry,
  Batch,
  Business,
  Category,
  CreditSummary,
  Customer,
  CustomerStatement,
  Dashboard,
  HeldSaleCart,
  NotificationList,
  Paginated,
  Payable,
  PaymentMethod,
  Product,
  ProductVariant,
  Purchase,
  Receivable,
  SessionUser,
  Shift,
  ShiftReport,
  OpenShiftSummary,
  Counter,
  CashMovement,
  CashMovementReason,
  CashMovementType,
  SuggestedFloat,
  Tax,
  Sale,
  SaleListItem,
  SerialRecord,
  StockItem,
  StockMovement,
  Store,
  Supplier,
  SupplierDetails,
  TaxReport,
  CreditAgeing,
  TransferResult,
  CountSheetLine,
  StockTakeResult,
  ReturnPurchaseResult,
  ReorderSuggestionGroup,
  SerialLookup,
  SupportCategory,
  SupportStatus,
  SupportThread,
  SupportTicketListItem,
  SubscriptionOverview,
  SubscriptionReceipt,
  OnlineGateway,
  OnlinePaymentStart,
  OnlinePaymentStatus,
  ReturnablePurchaseLine,
} from '@/types';

/** How a credit or supplier payment was made. Omitted, the API assumes cash. */
export interface PaymentOpts {
  method?: PaymentMethod;
  note?: string;
}

const get = async <T>(url: string, params?: object) =>
  (await api.get<T>(url, { params })).data;
const post = async <T>(url: string, body?: object) =>
  (await api.post<T>(url, body)).data;
const patch = async <T>(url: string, body?: object) =>
  (await api.patch<T>(url, body)).data;
const put = async <T>(url: string, body?: object) =>
  (await api.put<T>(url, body)).data;
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
  /**
   * Returns a fresh accessToken alongside the message: changing the password
   * retires every token minted under the old one, this caller's included, so
   * the client has to swap the new one in or the next request 401s.
   */
  changePassword: (currentPassword: string, newPassword: string) =>
    post<{ message: string; accessToken: string }>('/auth/change-password', {
      currentPassword,
      newPassword,
    }),
  me: () => get<SessionUser>('/auth/me'),
};

export const BusinessApi = {
  get: () => get<Business>('/business'),
  /** Which first steps the shop has taken, for the Dashboard's Getting started card. */
  setup: () => get<BusinessSetup>('/business/setup'),
  update: (body: object) => patch<Business>('/business', body),
  /**
   * The full data export. NDJSON, not JSON: one `{"table":..,"row":..}` per
   * line, streamed, so `responseType: 'text'` keeps axios from trying to
   * parse the whole thing as a single document.
   */
  exportData: async () =>
    (await api.get<string>('/business/export', { responseType: 'text' })).data,
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
  byBarcode: (barcode: string) => get<Product>(`/products/barcode/${encodeURIComponent(barcode)}`),
  create: (body: object) => post<Product>('/products', body),
  update: (id: string, body: object) => patch<Product>(`/products/${id}`, body),
  remove: (id: string) => del(`/products/${id}`),
  /** Set which stores carry this product (and its variants). */
  setStores: (id: string, storeIds: string[]) =>
    put<{ id: string; storeIds: string[]; variantsUpdated: number }>(
      `/products/${id}/stores`,
      { storeIds },
    ),
  uploadImage: async (file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    return (await api.post<{ imageUrl: string }>('/products/upload-image', fd))
      .data;
  },
  exportAll: () => get<Record<string, unknown>[]>('/products/export'),
  /** `dryRun` checks the file and reports what would happen, saving nothing. */
  importProducts: (items: Record<string, unknown>[], dryRun = false) =>
    post<{ created: number; updated: number; errors: { row: number; error: string }[] }>(
      '/products/import',
      { items, dryRun },
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
  dismissAll: () => post<{ ok: true; dismissed: number }>('/notifications/dismiss-all'),
};

/** A request header for the lock screen's billing-only pass, when there is one. */
const withPass = (pass?: string) => (pass ? { headers: { Authorization: `Bearer ${pass}` } } : undefined);

/**
 * The shop's own subscription, and paying for it online. Owners and
 * managers. Each call takes an optional billing-only pass: the lock screen
 * has one, and nothing else.
 */
export const SubscriptionApi = {
  overview: async (pass?: string) => (await api.get<SubscriptionOverview>('/subscription', withPass(pass))).data,
  receipt: (paymentId: string) => get<SubscriptionReceipt>(`/subscription/payments/${paymentId}/receipt`),
  /** Pay online: the price comes from the plan; the gateway sends the owner back to returnOrigin. */
  startOnline: async (body: { gateway: OnlineGateway; planId: string; months: number; returnOrigin: string }, pass?: string) =>
    (await api.post<OnlinePaymentStart>('/subscription/online', body, withPass(pass))).data,
  /** "I've paid": report money sent another way, for an admin to confirm. */
  reportPayment: async (body: CreatePaymentClaimBody, pass?: string) =>
    (await api.post<PaymentClaim>('/subscription/claims', body, withPass(pass))).data,
  /** A screenshot of the payment; its url goes into the report. */
  uploadProof: async (file: File, pass?: string) => {
    const fd = new FormData();
    fd.append('image', file);
    return (await api.post<{ url: string }>('/subscription/claims/proof', fd, withPass(pass))).data;
  },
  /** Withdraw a report still waiting for confirmation. */
  cancelReport: async (id: string, pass?: string) =>
    (await api.delete<{ cancelled: boolean }>(`/subscription/claims/${encodeURIComponent(id)}`, withPass(pass))).data,
  /** The return page: asks the gateway where the payment stands. Needs no session. */
  checkOnline: async (id: string) =>
    (await api.post<OnlinePaymentStatus>(`/subscription/online/${encodeURIComponent(id)}/check`)).data,
};

/** Set from the admin panel; public, so the sign-in page can show it too. */
export const StatusApi = {
  get: async () => (await api.get<{ maintenanceMessage: string | null; maintenanceMode: boolean; signupOpen: boolean }>('/status')).data,
};

/** Help & support: questions to the platform team, answered from the admin panel. */
export const SupportApi = {
  list: (params?: { status?: SupportStatus; page?: number; limit?: number }) =>
    get<Paginated<SupportTicketListItem>>('/support', params),
  get: (id: string) => get<SupportThread>(`/support/${id}`),
  create: (body: { category: SupportCategory; subject: string; body: string }) =>
    post<SupportThread>('/support', body),
  reply: (id: string, body: string) => post<SupportThread>(`/support/${id}/messages`, { body }),
};

export const InventoryApi = {
  stock: (params?: object) => get<Paginated<StockItem>>('/inventory/stock', params),
  lowStock: (storeId?: string) =>
    get<StockItem[]>('/inventory/low-stock', storeId ? { storeId } : undefined),
  expiring: (params?: object) => get<Batch[]>('/inventory/expiring', params),
  /** Opening stock from a spreadsheet. `dryRun` checks it and saves nothing. */
  importStock: (items: Record<string, unknown>[], opts: { storeId?: string; dryRun?: boolean }) =>
    post<{ rows?: number; imported?: number; units: number; errors: { row: number; error: string }[] }>(
      '/inventory/import-stock',
      { items, ...opts },
    ),
  /** Remove expired stock: an EXPIRED adjustment, and the batch emptied. */
  writeOffExpired: (body: { storeId: string; productId: string; batchId?: string }) =>
    post<{ writtenOff: number }>('/inventory/expiring/write-off', body),
  /** Mark stock nearing its date down to `price`, or end the markdown (null). */
  setClearance: (body: { storeId: string; productId: string; batchId?: string; price: number | null }) =>
    post<{ clearancePrice: number | null }>('/inventory/expiring/clearance', body),
  movements: (params?: object) =>
    get<Paginated<StockMovement>>('/inventory/movements', params),
  serials: (params?: object) =>
    get<Paginated<SerialRecord>>('/inventory/serials', params),
  /** In-stock serial numbers of one product at one store, oldest first. */
  inStockSerials: (storeId: string, productId: string) =>
    get<string[]>('/inventory/serials/in-stock', { storeId, productId }),
  /** Where one serial is -- for scanning an IMEI at the till. 404 when unknown. */
  lookupSerial: (serial: string) =>
    get<SerialLookup>(`/inventory/serials/lookup/${encodeURIComponent(serial)}`),
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
  get: (id: string) => get<SupplierDetails>(`/suppliers/${id}`),
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
  /** Received purchase lines a batch (or a product's own stock) could go back on. */
  returnable: (params: { storeId: string; productId: string; batchId?: string }) =>
    get<ReturnablePurchaseLine[]>('/purchases/returnable', params),
  pay: (id: string, amount: number, opts: PaymentOpts = {}) =>
    post<Purchase>(`/purchases/${id}/pay`, { amount, ...opts }),
  /** The supplier paid back (part of) what they owed on this purchase. */
  refundReceived: (id: string, amount: number, opts: PaymentOpts = {}) =>
    post<Purchase>(`/purchases/${id}/refund-received`, { amount, ...opts }),
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

export interface CloseShiftBody {
  countedCash: number;
  /** Of the counted cash, what stays in the drawer for the next shift. */
  cashLeft?: number;
  /** Notes and coins counted: denomination -> how many. */
  cashCount?: Record<string, number>;
  note?: string;
}

/** Counters (tills) per store -- owners and managers only. */
export const CountersApi = {
  /** `all`: include counters no longer in use (Settings lists them). */
  list: (params: { storeId?: string; all?: boolean } = {}) =>
    get<Counter[]>('/counters', {
      ...(params.storeId ? { storeId: params.storeId } : {}),
      ...(params.all ? { all: 'true' } : {}),
    }),
  create: (body: { storeId: string; name: string }) => post<Counter>('/counters', body),
  update: (id: string, body: { name?: string; isActive?: boolean }) => patch<Counter>(`/counters/${id}`, body),
};

export const ShiftsApi = {
  /** `counterId`: which counter to open. A cashier's is always their own. */
  open: (body: { storeId?: string; openingFloat: number; note?: string; counterId?: string }) =>
    post<Shift>('/shifts/open', body),
  /**
   * The till the caller is on. For an owner or manager with none of their own
   * that is the shift already open at the store — `shiftId` says which, when
   * more than one is open and they have picked.
   */
  current: (storeId?: string, shiftId?: string) =>
    get<ShiftReport | null>('/shifts/current', {
      ...(storeId ? { storeId } : {}),
      ...(shiftId ? { shiftId } : {}),
    }),
  /** Every till open at a store, for the "which drawer?" picker. */
  openAtStore: (storeId: string) =>
    get<OpenShiftSummary[]>('/shifts/open', { storeId }),
  report: (id: string) => get<ShiftReport>(`/shifts/${id}/report`),
  close: (id: string, body: CloseShiftBody) =>
    post<ShiftReport>(`/shifts/${id}/close`, body),
  /** Pay in / pay out on an open drawer. */
  addMovement: (
    id: string,
    body: { type: CashMovementType; reason: CashMovementReason; amount: number; note?: string },
  ) => post<CashMovement>(`/shifts/${id}/movements`, body),
  /** What the last shift on this counter left in its drawer, or null. */
  suggestedFloat: (storeId: string, counterId?: string) =>
    get<SuggestedFloat | null>('/shifts/float', { storeId, ...(counterId ? { counterId } : {}) }),
  list: (params?: object) => get<Paginated<Shift>>('/shifts', params),
};

export const CreditApi = {
  summary: (storeId?: string) =>
    get<CreditSummary>('/credit/summary', storeId ? { storeId } : undefined),
  receivables: (storeId?: string) =>
    get<Receivable[]>('/credit/receivables', storeId ? { storeId } : undefined),
  payables: (storeId?: string) =>
    get<Payable[]>('/credit/payables', storeId ? { storeId } : undefined),
  supplierRefunds: (storeId?: string) =>
    get<SupplierRefund[]>('/credit/supplier-refunds', storeId ? { storeId } : undefined),
};

export const AuditApi = {
  list: (params?: object) => get<Paginated<AuditEntry>>('/audit', params),
};

export const NotificationsAdminApi = {
  sendLowStockDigest: () =>
    post<{ message: string }>('/notifications/low-stock-digest'),
};

export const SalesApi = {
  /** Every bill the filter matches, one row each (owner / manager). */
  exportRows: (params?: object) =>
    get<{ rows: Record<string, unknown>[]; total: number; truncated: boolean }>('/sales/export', params),
  list: (params?: object) => get<Paginated<SaleListItem>>('/sales', params),
  get: (id: string) => get<Sale>(`/sales/${id}`),
  create: (body: object) => post<Sale>('/sales', body),
  hold: (body: object) => post<Sale>('/sales/hold', body),
  resume: (id: string) => post<HeldSaleCart>(`/sales/${id}/resume`, {}),
  discardHeld: (id: string) => del(`/sales/${id}`),
  return: (id: string, body: object) => post<ReturnResult>(`/sales/${id}/return`, body),
  /** What returning these lines would hand back. Writes nothing. */
  returnQuote: (id: string, items: { saleItemId: string; quantity: number }[]) =>
    get<ReturnQuote>(`/sales/${id}/return-quote`, {
      lines: items.map((i) => `${i.saleItemId}:${i.quantity}`).join(','),
    }),
  emailReceipt: (id: string, email?: string) =>
    post<{ message: string }>(`/sales/${id}/email-receipt`, email ? { email } : {}),
};

export const CustomersApi = {
  list: (params?: object) => get<Paginated<Customer>>('/customers', params),
  get: (id: string) => get<Customer>(`/customers/${id}`),
  create: (body: object) => post<Customer>('/customers', body),
  update: (id: string, body: object) => patch<Customer>(`/customers/${id}`, body),
  /**
   * `storeId` is what lets cash collected at a till reach that till's drawer:
   * the API books the payment to the shift open there, so the shift's
   * expected cash includes it.
   */
  payCredit: (
    id: string,
    amount: number,
    opts: PaymentOpts & { storeId?: string; shiftId?: string } = {},
  ) => post<Customer>(`/customers/${id}/pay-credit`, { amount, ...opts }),
  remove: (id: string) => del(`/customers/${id}`),
  /** The account rebuilt from credit sales and payments, oldest first. */
  statement: (id: string) => get<CustomerStatement>(`/customers/${id}/statement`),
};

export const UsersApi = {
  list: () => get<AppUser[]>('/users'),
  get: (id: string) => get<AppUser>(`/users/${id}`),
  create: (body: object) => post<AppUser>('/users', body),
  update: (id: string, body: object) => patch<AppUser>(`/users/${id}`, body),
  /** Deactivate — reversible, keeps the row and its history. */
  remove: (id: string) => del(`/users/${id}`),
  /**
   * Permanently delete an already-deactivated staff member. Owner-only, and
   * the API refuses (409) if they have sales, shifts or stock movements.
   */
  destroy: (id: string) => del<AppUser>(`/users/${id}/permanent`),
};

export const ReportsApi = {
  dashboard: (storeId?: string) =>
    get<Dashboard>('/reports/dashboard', storeId ? { storeId } : undefined),
  salesSummary: (params?: object) => get<unknown>('/reports/sales-summary', params),
  analytics: (params?: object) => get<Analytics>('/reports/analytics', params),
  taxReport: (params?: object) => get<TaxReport>('/reports/tax', params),
  creditAgeing: (storeId?: string) =>
    get<CreditAgeing>('/reports/credit-ageing', storeId ? { storeId } : undefined),
};
