import { api } from '@/lib/api';
import type {
  Analytics,
  AppUser,
  AuthUserLite,
  Batch,
  Category,
  Customer,
  Dashboard,
  Paginated,
  Product,
  Purchase,
  Sale,
  SaleListItem,
  StockItem,
  StockMovement,
  Store,
  Supplier,
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
  }) => post<{ accessToken: string; user: AuthUserLite }>('/auth/register', body),
  me: () => get<any>('/auth/me'),
};

export const BusinessApi = {
  get: () => get<any>('/business'),
  update: (body: object) => patch<any>('/business', body),
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

export const ProductsApi = {
  list: (params?: object) => get<Paginated<Product>>('/products', params),
  get: (id: string) => get<Product>(`/products/${id}`),
  byBarcode: (barcode: string) => get<Product>(`/products/barcode/${barcode}`),
  create: (body: object) => post<Product>('/products', body),
  update: (id: string, body: object) => patch<Product>(`/products/${id}`, body),
  remove: (id: string) => del(`/products/${id}`),
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
};

export const SalesApi = {
  list: (params?: object) => get<Paginated<SaleListItem>>('/sales', params),
  get: (id: string) => get<Sale>(`/sales/${id}`),
  create: (body: object) => post<Sale>('/sales', body),
  return: (id: string, body: object) =>
    post<{ sale: Sale; refund: number }>(`/sales/${id}/return`, body),
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
};
