import { expect, test } from '@playwright/test';
import { api, dropShop, makeShop, signIn, type TestShop } from './helpers';

// Live updates (GET /api/events): what another device does reaches an open
// screen within seconds, and the 30-second poll still covers a blocked stream.
test.describe.configure({ mode: 'serial' });

let shop: TestShop;
test.beforeAll(async () => {
  shop = await makeShop('Live', 10);
  await api(shop.token, 'POST', '/shifts/open', { storeId: shop.storeId, openingFloat: 0 });
});
test.afterAll(async () => {
  if (shop) await dropShop(shop);
});

/** Another till: a cash sale straight through the API. */
async function sellElsewhere(quantity: number) {
  const sale = await api<{ receiptNo: string }>(shop.token, 'POST', '/sales', {
    storeId: shop.storeId,
    paymentMethod: 'CASH',
    items: [{ productId: shop.product.id, quantity, unitPrice: 100 }],
  });
  expect(sale.status).toBe(201);
  return sale.body.receiptNo;
}

/** Wait until this page's live stream is open, so the test measures delivery, not connecting. */
async function streamOpen(page: import('@playwright/test').Page) {
  await page.waitForResponse((r) => r.url().endsWith('/api/events') && r.status() === 200);
}

test("another till's sale reaches an open Dashboard and till within seconds", async ({ browser }) => {
  const dash = await (await browser.newContext()).newPage();
  const till = await (await browser.newContext()).newPage();
  await Promise.all([streamOpen(dash), signIn(dash, shop, '/')]);
  await Promise.all([streamOpen(till), signIn(till, shop, '/pos')]);
  await expect(dash.getByText(/transactions?, all time/).first()).toHaveText(/^0 transactions/);
  await expect(till.getByText('10 in stock')).toBeVisible();

  await sellElsewhere(2);

  // Far inside the 30-second poll: this is the push.
  await expect(dash.getByText(/transactions?, all time/).first()).toHaveText(/^1 transaction,/, { timeout: 5_000 });
  await expect(till.getByText('8 in stock')).toBeVisible({ timeout: 5_000 });
});

test('an announcement lands in the bell at once, with a pop-up and the count in the tab title', async ({ page }) => {
  await Promise.all([streamOpen(page), signIn(page, shop, '/')]);
  const bell = page.getByRole('button', { name: /^Notifications/ });
  await expect(bell).toHaveAccessibleName('Notifications');

  const title = `Live ${Date.now().toString(36)}`;
  const sent = await api(shop.adminToken, 'POST', '/admin/announcements', {
    title,
    body: 'Arrives as it is sent.',
    businessIds: [shop.id],
    email: false,
  });
  expect(sent.status).toBe(201);

  await expect(bell).toHaveAccessibleName('Notifications, 1 unread', { timeout: 5_000 });
  await expect(page.getByRole('status').getByText(title)).toBeVisible();
  await expect(page).toHaveTitle(/^\(1\) /);
});

test('a sale that runs stock low raises the low-stock alert within seconds', async ({ page }) => {
  await api(shop.token, 'POST', '/inventory/reorder-level', { storeId: shop.storeId, productId: shop.product.id, reorderLevel: 5 });
  await Promise.all([streamOpen(page), signIn(page, shop, '/')]);
  const bell = page.getByRole('button', { name: /^Notifications/ });

  await sellElsewhere(4); // 8 -> 4, under the reorder level of 5

  // The alert sync runs ten seconds after the last stock change, not at the
  // ten-minute sweep.
  await bell.click();
  await expect(page.getByText(`Low stock: ${shop.product.name}`)).toBeVisible({ timeout: 20_000 });
});

test('with the stream blocked, screens still catch up within 30 seconds', async ({ page }) => {
  await page.route('**/api/events', (r) => r.abort());
  await page.clock.install();
  await signIn(page, shop, '/');
  const totals = page.getByText(/transactions?, all time/).first();
  await expect(totals).toHaveText(/^2 transactions/);

  await sellElsewhere(1);
  await expect(totals).toHaveText(/^2 transactions/);
  await page.clock.fastForward('00:31');
  await expect(totals).toHaveText(/^3 transactions/);
});
