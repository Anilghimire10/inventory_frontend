import { expect, test, type Page } from '@playwright/test';
import { api, dropShop, ignorePrinting, makeShop, signIn, type TestShop } from './helpers';

// One shop's day at the till, in order: open a shift with a float, sell,
// take a return, and close with the drawer counted. Each step leans on the
// one before it, so they run in sequence and stop at the first failure.
test.describe.configure({ mode: 'serial' });

let shop: TestShop;
let receiptNo: string;

test.beforeAll(async () => {
  shop = await makeShop('Till', 10);
});
test.afterAll(async () => {
  if (shop) await dropShop(shop);
});

/** The product's on-hand quantity at the shop's store, from the API. */
async function onHand() {
  const res = await api<{ data: { onHandQty: number | string }[] }>(
    shop.token,
    'GET',
    `/products?ids=${shop.product.id}&storeId=${shop.storeId}&limit=1`,
  );
  return Number(res.body.data[0].onHandQty);
}

async function openTill(page: Page) {
  await ignorePrinting(page);
  await signIn(page, shop, '/pos');
}

test('open a shift and ring up a cash sale, with the change due shown', async ({ page }) => {
  await openTill(page);

  await page.getByLabel('Opening float').fill('500');
  await page.getByRole('button', { name: /Open shift with/ }).click();

  const add = page.getByRole('button', { name: `Add ${shop.product.name}`, exact: true });
  await add.click();
  await add.click();
  await expect(page.getByRole('button', { name: /Complete Sale · .*200\.00/ })).toBeVisible();

  await page.getByLabel('Amount tendered').fill('500');
  await page.getByRole('button', { name: /Complete Sale/ }).click();

  const done = page.getByText(/Sale .+ completed/);
  await expect(done).toBeVisible();
  receiptNo = (await done.innerText()).match(/Sale (.+) completed/)![1];

  // The change stays on screen for the cashier to hand back.
  await expect(page.getByText('Change due')).toBeVisible();
  await expect(page.getByText(/300\.00/).first()).toBeVisible();

  // The till and the books both lost two units.
  await expect(page.getByText('8 in stock')).toBeVisible();
  expect(await onHand()).toBe(8);

  // The shortcuts list is a real dialog: named, and Esc closes it.
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(help).toContainText('Hold the sale');
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
});

test('return one unit from the Sales page, refunded in cash', async ({ page }) => {
  await openTill(page);
  await page.goto('/sales');

  await page.getByRole('cell', { name: new RegExp(receiptNo) }).click();
  await page.getByText('Return items').click();
  await page.getByLabel(`How many ${shop.product.name} to return`).fill('1');
  await page.getByRole('button', { name: 'Process return' }).click();

  await expect(page.getByText(/Return done — .*100\.00 handed back/)).toBeVisible();
  // Not damaged, so it goes back on the shelf.
  expect(await onHand()).toBe(9);
});

test('close the shift: float + sale − refund is what the drawer should hold', async ({ page }) => {
  await openTill(page);

  await page.getByRole('button', { name: /Close shift/ }).first().click();
  // 500 float + 200 cash sale − 100 cash refund.
  const expected = page.getByText('Expected cash').locator('xpath=ancestor::div[1]');
  await expect(expected).toContainText('600.00');

  await page.getByLabel('Cash counted').fill('600');
  await expect(page.getByText('Drawer balances')).toBeVisible();
  await page.getByRole('button', { name: 'Close & print Z report' }).click();

  await expect(page.getByText('Shift closed — drawer balances')).toBeVisible();
  // No shift open now: the till asks for a float again.
  await expect(page.getByLabel('Opening float')).toBeVisible();
});

test("Analytics shows the day's trade, and its charts load", async ({ page }) => {
  await openTill(page);
  await page.goto('/analytics');

  // One bill. Two units went out and one came back, so one stayed sold.
  const bills = page.getByText('1 item sold').locator('..');
  await expect(bills).toContainText('Bills');
  await expect(bills.getByText('1', { exact: true })).toBeVisible();

  // recharts arrives on demand; once it has, the charts draw as SVG.
  await expect(page.getByRole('heading', { name: 'Sales trend' })).toBeVisible();
  await expect(page.locator('.recharts-surface').first()).toBeVisible();

  // The Dashboard's two charts load the same way.
  await page.goto('/');
  await expect(page.getByText('Sales & revenue trend')).toBeVisible();
  await expect(page.locator('.recharts-surface').first()).toBeVisible();
});
