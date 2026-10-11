import { expect, test } from '@playwright/test';
import { API, api, dropShop, ignorePrinting, makeCounter, makeShop, signIn, type TestShop } from './helpers';

// Two cashiers' tills open at one store, and an owner with none of their own.
// Cash the owner hands back on a return, or takes against a customer's
// credit, has to land in a drawer they name: booked to none, the drawer it
// really went through counted short (or over) at close.
test.describe.configure({ mode: 'serial' });

let shop: TestShop;
let tillA: string;
let tillB: string;
let receiptNo: string;
let saleId: string;
let customerId: string;

async function staffToken(label: string) {
  const stamp = `${label}-${Date.now().toString(36)}`;
  const email = `e2e+${stamp}@example.com`;
  const password = `E2e-password-${stamp}`;
  const made = await api(shop.token, 'POST', '/users', {
    email,
    name: `Cashier ${label}`,
    password,
    role: 'CASHIER',
    storeId: shop.storeId,
    // Each cashier works their own counter.
    counterId: await makeCounter(shop, `Till ${label}`),
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'shop-e2e' },
    body: JSON.stringify({ email, password }),
  });
  return ((await res.json()) as { accessToken: string }).accessToken;
}

async function openTill(token: string) {
  const res = await api<{ id: string }>(token, 'POST', '/shifts/open', { storeId: shop.storeId, openingFloat: 1000 });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id;
}

const report = async (id: string) =>
  (await api<{ cashRefunds: number; creditCollected: number }>(shop.token, 'GET', `/shifts/${id}/report`)).body;

test.beforeAll(async () => {
  shop = await makeShop('Tills', 10);
  tillA = await openTill(await staffToken('a'));
  tillB = await openTill(await staffToken('b'));
  // Sold from A's till: two units, cash.
  const sale = await api<{ id: string; receiptNo: string }>(shop.token, 'POST', '/sales', {
    storeId: shop.storeId,
    shiftId: tillA,
    items: [{ productId: shop.product.id, quantity: 2 }],
    paymentMethod: 'CASH',
  });
  expect(sale.status, JSON.stringify(sale.body)).toBe(201);
  saleId = sale.body.id;
  receiptNo = sale.body.receiptNo;
  // A customer who owes 100, from a credit sale.
  const customer = await api<{ id: string }>(shop.token, 'POST', '/customers', { name: 'E2E Khata', phone: '9800000000' });
  customerId = customer.body.id;
  const credit = await api(shop.token, 'POST', '/sales', {
    storeId: shop.storeId,
    shiftId: tillA,
    customerId,
    items: [{ productId: shop.product.id, quantity: 1 }],
    paymentMethod: 'CREDIT',
  });
  expect(credit.status, JSON.stringify(credit.body)).toBe(201);
});
test.afterAll(async () => {
  if (shop) await dropShop(shop);
});

test('the server refuses cash with no till named while two are open', async () => {
  const items = await api<{ items: { id: string }[] }>(shop.token, 'GET', `/sales/${saleId}`);
  const refund = await api<{ code?: string }>(shop.token, 'POST', `/sales/${saleId}/return`, {
    items: [{ saleItemId: items.body.items[0].id, quantity: 1 }],
  });
  expect(refund.status).toBe(409);
  expect(refund.body.code).toBe('TILL_CHOICE');

  const pay = await api<{ code?: string }>(shop.token, 'POST', `/customers/${customerId}/pay-credit`, {
    amount: 50,
    method: 'CASH',
    storeId: shop.storeId,
  });
  expect(pay.status).toBe(409);
  expect(pay.body.code).toBe('TILL_CHOICE');

  // Named, it lands in that drawer.
  const named = await api(shop.token, 'POST', `/customers/${customerId}/pay-credit`, {
    amount: 50,
    method: 'CASH',
    storeId: shop.storeId,
    shiftId: tillB,
  });
  expect(named.status, JSON.stringify(named.body)).toBe(201);
  expect((await report(tillB)).creditCollected).toBe(50);
  expect((await report(tillA)).creditCollected).toBe(0);
});

test('a cash refund on the Sales page asks which till, and comes out of that one', async ({ page }) => {
  await ignorePrinting(page);
  await signIn(page, shop, '/sales');
  await page.getByRole('cell', { name: new RegExp(receiptNo) }).click();
  await page.getByText('Return items').click();
  await page.getByLabel(`How many ${shop.product.name} to return`).fill('1');

  const picker = page.getByLabel('Cash comes out of');
  await expect(picker).toBeVisible();
  const process = page.getByRole('button', { name: 'Process return' });
  await expect(process).toBeDisabled();

  const tillBOption = await picker.locator('option', { hasText: 'Cashier b' }).getAttribute('value');
  await picker.selectOption(tillBOption!);
  await expect(process).toBeEnabled();
  await process.click();
  await expect(page.getByText(/Return done — .*100\.00 handed back/)).toBeVisible();

  expect((await report(tillB)).cashRefunds).toBe(100);
  expect((await report(tillA)).cashRefunds).toBe(0);
});
