import type { Page } from '@playwright/test';

export const API = process.env.API_URL ?? 'http://localhost:3000/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@platform.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin12345';

export async function api<T>(token: string, method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as T };
}

async function login(path: string, email: string, password: string) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'shop-e2e' },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { accessToken?: string };
  if (!body.accessToken) throw new Error(`Sign-in to ${path} failed: ${JSON.stringify(body)}`);
  return body.accessToken;
}

export interface TestShop {
  id: string;
  name: string;
  adminToken: string;
  /** The owner's token: for setup through the API, and for the page. */
  token: string;
  storeId: string;
  product: { id: string; name: string; price: number };
}

/**
 * A rupee shop for one test file: an owner with a password (so no invite
 * email), paid up for 20 days, its Main Store holding `stock` of one untaxed
 * product at NPR 100. Delete it with `dropShop` when done.
 */
export async function makeShop(label: string, stock = 10): Promise<TestShop> {
  const adminToken = await login('/admin/auth/login', ADMIN_EMAIL, ADMIN_PASSWORD);
  const stamp = Date.now().toString(36);
  const email = `e2e+shop-${stamp}@example.com`;
  const password = `E2e-password-${stamp}`;
  const name = `E2E ${label} ${stamp}`;
  const made = await api<{ business: { id: string; name: string } }>(adminToken, 'POST', '/admin/businesses', {
    businessName: name,
    currency: 'NPR',
    ownerName: 'E2E Owner',
    ownerEmail: email,
    password,
    subscribedTo: new Date(Date.now() + 20 * 24 * 3600_000).toISOString(),
  });
  if (made.status !== 201) throw new Error(`Could not create the test business: ${JSON.stringify(made.body)}`);

  const token = await login('/auth/login', email, password);
  const stores = await api<{ id: string }[]>(token, 'GET', '/stores');
  const storeId = stores.body[0].id;
  const product = await api<{ id: string; name: string }>(token, 'POST', '/products', {
    name: `E2E Rice ${stamp}`,
    costPrice: 60,
    sellingPrice: 100,
    isTaxable: false,
    storeIds: [storeId],
  });
  if (product.status !== 201) throw new Error(`Could not create the test product: ${JSON.stringify(product.body)}`);
  const stocked = await api(token, 'POST', '/inventory/adjust', {
    storeId,
    productId: product.body.id,
    delta: stock,
    reason: 'COUNT_CORRECTION',
  });
  if (stocked.status >= 300) throw new Error(`Could not stock the test product: ${JSON.stringify(stocked.body)}`);

  return {
    ...made.body.business,
    adminToken,
    token,
    storeId,
    product: { id: product.body.id, name: product.body.name, price: 100 },
  };
}

/**
 * A counter (till) at the shop's store. The store opens with "Counter 1";
 * every cashier needs one of their own, set up before they are assigned.
 */
export async function makeCounter(shop: TestShop, name: string) {
  const res = await api<{ id: string }>(shop.token, 'POST', '/counters', { storeId: shop.storeId, name });
  if (res.status !== 201) throw new Error(`Could not create the counter: ${JSON.stringify(res.body)}`);
  return res.body.id;
}

/**
 * Throws when the delete fails, so a broken delete shows up as a failing
 * test rather than test shops quietly piling up in the database.
 */
export async function dropShop(shop: TestShop) {
  const res = await api(shop.adminToken, 'DELETE', `/admin/businesses/${shop.id}`, { confirmName: shop.name });
  if (res.status >= 300) throw new Error(`Could not delete the test shop: ${JSON.stringify(res.body)}`);
}

/**
 * Open the app already signed in as the owner. The token goes where the app
 * keeps it (sessionStorage, per tab) before any page script runs, so no test
 * spends one of the ten sign-ins a minute the API allows.
 */
export async function signIn(page: Page, shop: TestShop, path = '/') {
  await page.addInitScript((t) => sessionStorage.setItem('inv_token', t), shop.token);
  await page.goto(path);
}

/**
 * Printing opens a window; the tests check the screen, not the paper. Swallow
 * the window so it doesn't steal focus or leave tabs behind.
 */
export async function ignorePrinting(page: Page) {
  await page.addInitScript(() => {
    window.open = () =>
      ({ document: { open() {}, write() {}, close() {} }, focus() {}, print() {}, close() {}, addEventListener() {} }) as unknown as Window;
  });
}
