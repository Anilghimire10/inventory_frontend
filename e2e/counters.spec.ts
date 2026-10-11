import { expect, test } from '@playwright/test';
import { API, api, dropShop, ignorePrinting, makeShop, signIn, type TestShop } from './helpers';

// Counters, end to end: the owner sets one up in Settings, assigns a new
// cashier to it in Staff, the cashier opens exactly that counter at the till,
// and the owner then sees it as a till to work on -- or the store's other,
// free counter to open.
test.describe.configure({ mode: 'serial' });

let shop: TestShop;
const stamp = Date.now().toString(36);
const cashier = { name: 'Front Cashier', email: `e2e+front-${stamp}@example.com`, password: `E2e-password-${stamp}` };

test.beforeAll(async () => {
  shop = await makeShop('Counters', 10);
});
test.afterAll(async () => {
  if (shop) await dropShop(shop);
});

test('the owner adds a counter, then assigns a new cashier to it', async ({ page }) => {
  await signIn(page, shop, '/settings?tab=stores');
  // The store opened with Counter 1.
  await expect(page.getByText('Counter 1', { exact: true })).toBeVisible();
  await page.getByLabel(/New counter at/).fill('Front desk');
  await page.getByRole('button', { name: 'Add counter' }).click();
  await expect(page.getByText('Front desk', { exact: true })).toBeVisible();

  await page.goto('/users');
  await page.getByRole('button', { name: 'Add staff' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add staff' });
  await dialog.getByLabel('Name').fill(cashier.name);
  await dialog.getByLabel('Email').fill(cashier.email);
  await dialog.getByLabel('Password', { exact: true }).fill(cashier.password);
  await dialog.getByLabel('Role').selectOption('CASHIER');
  // Two counters at the store: the owner has to say which.
  const counter = dialog.getByLabel('Counter');
  await expect(counter).toHaveValue('');
  await counter.selectOption({ label: 'Front desk' });
  await dialog.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('row', { name: new RegExp(cashier.name) })).toContainText('Front desk');
});

test('the cashier opens their own counter, and only that one', async ({ page }) => {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'shop-e2e' },
    body: JSON.stringify({ email: cashier.email, password: cashier.password }),
  });
  const { accessToken } = (await res.json()) as { accessToken: string };

  await ignorePrinting(page);
  await page.addInitScript((t) => sessionStorage.setItem('inv_token', t), accessToken);
  await page.goto('/pos');
  const dialog = page.getByRole('dialog', { name: 'Open your shift' });
  await expect(dialog).toContainText('Front desk');
  await dialog.getByLabel('Opening float').fill('1000');
  await dialog.getByRole('button', { name: /Open shift with/ }).click();
  await expect(dialog).toBeHidden();

  const open = await api<{ counter: { name: string } | null; openedBy: { name: string } }[]>(
    shop.token, 'GET', `/shifts/open?storeId=${shop.storeId}`,
  );
  expect(open.body.map((t) => [t.counter?.name, t.openedBy.name])).toEqual([['Front desk', cashier.name]]);

  // Asking the server for another counter is refused outright.
  const counters = await api<{ id: string; name: string }[]>(shop.token, 'GET', `/counters?storeId=${shop.storeId}`);
  const other = counters.body.find((c) => c.name === 'Counter 1')!;
  const refused = await api(accessToken, 'POST', '/shifts/open', { storeId: shop.storeId, openingFloat: 0, counterId: other.id });
  expect(refused.status).toBe(403);
});

test("the owner chooses: work on the cashier's counter, or open the free one", async ({ page }) => {
  await ignorePrinting(page);
  await signIn(page, shop, '/pos');
  const dialog = page.getByRole('dialog', { name: 'Which till will you work on?' });
  await expect(dialog.getByRole('button', { name: /Work on Front desk · Front Cashier’s till · Cashier/ })).toBeVisible();
  await dialog.getByRole('button', { name: /Open Counter 1/ }).click();
  await dialog.getByLabel('Opening float').fill('500');
  await dialog.getByRole('button', { name: /Open Counter 1 with/ }).click();
  await expect(dialog).toBeHidden();

  const open = await api<{ counter: { name: string } | null; isOwnShift: boolean }[]>(
    shop.token, 'GET', `/shifts/open?storeId=${shop.storeId}`,
  );
  expect(open.body.find((t) => t.isOwnShift)?.counter?.name).toBe('Counter 1');
});

test("a cashier arriving at a counter the owner opened works on that till, and may close it", async ({ page }) => {
  // The owner has Counter 1 open (the test above). Assign a new cashier to it.
  const counters = await api<{ id: string; name: string }[]>(shop.token, 'GET', `/counters?storeId=${shop.storeId}`);
  const c1 = counters.body.find((c) => c.name === 'Counter 1')!;
  const back = { email: `e2e+back-${stamp}@example.com`, password: `E2e-password-back-${stamp}` };
  const made = await api(shop.token, 'POST', '/users', {
    email: back.email, name: 'Back Cashier', password: back.password, role: 'CASHIER', storeId: shop.storeId, counterId: c1.id,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'shop-e2e' },
    body: JSON.stringify(back),
  });
  const { accessToken } = (await res.json()) as { accessToken: string };

  await ignorePrinting(page);
  await page.addInitScript((t) => sessionStorage.setItem('inv_token', t), accessToken);
  await page.goto('/pos');
  // No float to count: the till is already open on their counter.
  await expect(page.getByText(/['’]s till/).first()).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Open your shift' })).toBeHidden();
  await page.getByRole('button', { name: `Add ${shop.product.name}`, exact: true }).click();
  await page.getByLabel('Amount tendered').fill('100');
  await page.getByRole('button', { name: /Complete Sale/ }).click();
  await expect(page.getByText(/Sale .+ completed/)).toBeVisible();

  const open = await api<{ id: string; counter: { name: string } | null; salesCount: number }[]>(
    shop.token, 'GET', `/shifts/open?storeId=${shop.storeId}`,
  );
  const ownerTill = open.body.find((t) => t.counter?.name === 'Counter 1')!;
  expect(ownerTill.salesCount).toBe(1);

  // The cashier at that counter can count it out at the end of the day.
  const closed = await api(accessToken, 'POST', `/shifts/${ownerTill.id}/close`, { countedCash: 600 });
  expect(closed.status, JSON.stringify(closed.body)).toBeLessThan(300);
});
