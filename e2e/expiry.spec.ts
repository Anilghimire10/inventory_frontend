import { expect, test, type Page } from '@playwright/test';
import { api, dropShop, ignorePrinting, makeShop, signIn, type TestShop } from './helpers';

// Stock nearing its date, end to end: mark a batch down and sell it at the
// till, take a return back into the batch it came from (and one written off
// as expired), send what is left back to the supplier, and a dated product
// moving onto batches when a delivery brings a second date. In sequence: each
// step leans on the stock the one before left.
test.describe.configure({ mode: 'serial' });

let shop: TestShop;
let supplierId: string;
let milk: { id: string; name: string };
let receiptNo: string;
let laterPurchaseId: string;

const inDays = (n: number) => new Date(Date.now() + n * 24 * 3600_000).toISOString().slice(0, 10);

interface ExpiringRow {
  id: string;
  batchNumber: string | null;
  quantity: string;
  expired: boolean;
  clearancePrice: number | null;
  product: { id: string };
}

/** The shop's Expiring list (expired or within `days`), from the API. */
async function expiring(days = 365) {
  const res = await api<ExpiringRow[]>(shop.token, 'GET', `/inventory/expiring?storeId=${shop.storeId}&days=${days}`);
  return res.body;
}
const batchQty = async (batchNumber: string) =>
  Number((await expiring()).find((r) => r.batchNumber === batchNumber)?.quantity ?? 0);

async function receive(productId: string, quantity: number, batchNumber: string | null, expiryDate: string) {
  const res = await api<{ id: string }>(shop.token, 'POST', '/purchases', {
    storeId: shop.storeId,
    supplierId,
    reference: `E2E ${batchNumber ?? expiryDate}`,
    // On credit: what a return takes off is then what is owed.
    amountPaid: 0,
    items: [{ productId, quantity, costPrice: 60, ...(batchNumber ? { batchNumber } : {}), expiryDate }],
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id;
}

async function openPage(page: Page, path: string) {
  await ignorePrinting(page);
  await signIn(page, shop, path);
}

test.beforeAll(async () => {
  shop = await makeShop('Expiry', 10);
  const supplier = await api<{ id: string }>(shop.token, 'POST', '/suppliers', { name: 'E2E Dairy' });
  supplierId = supplier.body.id;
  const made = await api<{ id: string; name: string }>(shop.token, 'POST', '/products', {
    name: `E2E Milk ${Date.now().toString(36)}`,
    costPrice: 60,
    sellingPrice: 100,
    isTaxable: false,
    trackBatches: true,
    storeIds: [shop.storeId],
  });
  milk = made.body;
  await receive(milk.id, 3, 'SOON', inDays(5));
  laterPurchaseId = await receive(milk.id, 5, 'LATER', inDays(200));
});
test.afterAll(async () => {
  if (shop) await dropShop(shop);
});

test('mark down the batch expiring soon; the till charges it on those units only', async ({ page }) => {
  await openPage(page, '/inventory?tab=expiring');

  const row = page.getByRole('row', { name: /SOON/ });
  await row.getByRole('button', { name: 'Mark down' }).click();
  await page.getByLabel(/Clearance price/).fill('80');
  await page.getByRole('dialog').getByRole('button', { name: 'Mark down' }).click();
  await expect(row).toContainText('Clearance');
  await expect(row).toContainText('80.00');

  await page.goto('/pos');
  await page.getByLabel('Opening float').fill('0');
  await page.getByRole('button', { name: /Open shift with/ }).click();
  const add = page.getByRole('button', { name: `Add ${milk.name}`, exact: true });
  for (let i = 0; i < 4; i++) await add.click();
  // 3 marked-down units at 80, the 4th from the fresh batch at 100.
  await expect(page.getByText(/Clearance −.*60\.00/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Complete Sale · .*340\.00/ })).toBeVisible();
  await page.getByLabel('Amount tendered').fill('400');
  await page.getByRole('button', { name: /Complete Sale/ }).click();
  const done = page.getByText(/Sale .+ completed/);
  await expect(done).toBeVisible();
  receiptNo = (await done.innerText()).match(/Sale (.+) completed/)![1];

  // The sale drew the soonest batch dry, then one fresh unit.
  expect(await batchQty('SOON')).toBe(0);
  expect(await batchQty('LATER')).toBe(4);
});

test('a return goes back to the batch it was sold from; an expired one is written off as expired', async ({ page }) => {
  await openPage(page, '/sales');
  const openReturn = async () => {
    await page.getByRole('cell', { name: new RegExp(receiptNo) }).click();
    await page.getByText('Return items').click();
  };

  // Back on the shelf: into SOON, which the sale took it from -- not LATER.
  await openReturn();
  await page.getByLabel(`How many ${milk.name} to return`).fill('1');
  await page.getByRole('button', { name: 'Process return' }).click();
  await expect(page.getByText(/Return done/)).toBeVisible();
  expect(await batchQty('SOON')).toBe(1);
  expect(await batchQty('LATER')).toBe(4);

  // Came back sour: written off, reason Expired, and no batch gets it.
  await page.keyboard.press('Escape');
  await openReturn();
  await page.getByLabel(`How many ${milk.name} to return`).fill('1');
  await page.getByLabel(`What happens to the returned ${milk.name}`).selectOption('EXPIRED');
  await page.getByRole('button', { name: 'Process return' }).click();
  await expect(page.getByText(/Return done/)).toBeVisible();
  expect(await batchQty('SOON')).toBe(1);
  expect(await batchQty('LATER')).toBe(4);
  const moves = await api<{ data: { type: string; reason: string | null; note: string | null }[] }>(
    shop.token,
    'GET',
    `/inventory/movements?productId=${milk.id}&storeId=${shop.storeId}&limit=5`,
  );
  expect(moves.body.data.some((m) => m.type === 'ADJUSTMENT' && m.reason === 'EXPIRED' && /Returned expired/.test(m.note ?? ''))).toBe(true);
});

test('send the rest of the soon batch back to the supplier from the Expiring list', async ({ page }) => {
  await openPage(page, '/inventory?tab=expiring');
  const row = page.getByRole('row', { name: /SOON/ });
  await row.getByRole('button', { name: 'Return to supplier' }).click();
  const dialog = page.getByRole('dialog', { name: 'Return to supplier' });
  await expect(dialog).toContainText('E2E Dairy');
  await dialog.getByRole('button', { name: /^Return 1$/ }).click();
  await expect(page.getByText(/Returned — .*60\.00 off what you owe/)).toBeVisible();
  expect(await batchQty('SOON')).toBe(0);
});

test('a supplier payment made during a return is never lost', async () => {
  // Pay the LATER invoice (5 × 60) and send one unit back at the same moment,
  // several times over. Whichever lands first, what the purchase says was paid
  // plus what the supplier owes back must equal what the ledger paid.
  for (let i = 0; i < 4; i++) {
    const id = i === 0 ? laterPurchaseId : await receive(milk.id, 5, 'LATER', inDays(200));
    const purchase = await api<{ items: { id: string }[] }>(shop.token, 'GET', `/purchases/${id}`);
    await Promise.all([
      api(shop.token, 'POST', `/purchases/${id}/pay`, { amount: 300 }),
      api(shop.token, 'POST', `/purchases/${id}/return`, { items: [{ purchaseItemId: purchase.body.items[0].id, quantity: 1 }] }),
    ]);
    const after = await api<{ amountPaid: string; refundDue: string; total: string; payments?: { type: string; amount: string }[] }>(
      shop.token,
      'GET',
      `/purchases/${id}`,
    );
    const paid = (after.body.payments ?? [])
      .filter((p) => p.type === 'SUPPLIER_PAYMENT')
      .reduce((n, p) => n + Number(p.amount), 0);
    expect(Number(after.body.total)).toBe(240);
    expect(Number(after.body.amountPaid) + Number(after.body.refundDue)).toBe(paid);
  }
});

test('a delivery with a second date moves a dated product onto batches', async () => {
  // The shop's rice keeps one date on itself: 10 units expiring in 10 days.
  await api(shop.token, 'PATCH', `/products/${shop.product.id}`, { expiryDate: inDays(10) });
  await receive(shop.product.id, 4, null, inDays(300));

  const rice = await api<{ trackBatches: boolean; expiryDate: string | null }>(shop.token, 'GET', `/products/${shop.product.id}`);
  expect(rice.body.trackBatches).toBe(true);
  expect(rice.body.expiryDate).toBeNull();
  // The old 10 keep their 10-day date; the new 4 aren't re-dated with it.
  const soon = (await expiring(30)).filter((r) => r.product.id === shop.product.id);
  expect(soon.map((r) => Number(r.quantity))).toEqual([10]);
  const all = (await expiring(400)).filter((r) => r.product.id === shop.product.id);
  expect(all.map((r) => Number(r.quantity)).sort((a, b) => a - b)).toEqual([4, 10]);
});
