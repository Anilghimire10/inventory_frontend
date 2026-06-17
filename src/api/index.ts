import { api } from '@/lib/api';
import type {
  Analytics,
  AppNotification,
  AppUser,
  AuthUserLite,
  AuditEntry,
  Batch,
  Category,
  CreditSummary,
  Customer,
  Dashboard,
  NotificationList,
  Paginated,
  Payable,
  Product,
  Purchase,
  Receivable,
  Tax,
  Sale,
  SaleListItem,
  StockItem,
  StockMovement,
  Store,
  Supplier,
  TaxReport,
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
  changePassword: (currentPassword: string, newPassword: string) =>
    post<{ message: string }>('/auth/change-password', {
      currentPassword,
      newPassword,
    }),
  me: () => get<any>('/auth/me'),
};

export const BusinessApi = {
  get: () => get<any>('/business'),
  update: (body: object) => patch<any>('/business', body),
  exportData: () => get<any>('/business/export'),
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
  adjust: (body: object) => post('/inventory/adjust', body),
  setReorderLevel: (body: object) => post('/inventory/reorder-level', body),
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
  receive: (id: string) => post<Purchase>(`/purchases/${id}/receive`),
  pay: (id: string, amount: number) =>
    post<Purchase>(`/purchases/${id}/pay`, { amount }),
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
  salesSummary: (params?: object) => get<any>('/reports/sales-summary', params),
  analytics: (params?: object) => get<Analytics>('/reports/analytics', params),
  taxReport: (params?: object) => get<TaxReport>('/reports/tax', params),
};
