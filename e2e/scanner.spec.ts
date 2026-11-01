import { expect, test } from '@playwright/test';
import { api, dropShop, ignorePrinting, makeShop, signIn, type TestShop } from './helpers';

// A barcode scanner types the code fast and presses Enter into whatever has
// focus. The till takes such a burst as a scan wherever the cursor is, and
// puts back the field it typed into.
const BARCODE = `89${Date.now().toString().slice(-11)}`;
let shop: TestShop;

test.beforeAll(async () => {
  shop = await makeShop('Scanner', 10);
  const set = await api(shop.token, 'PATCH', `/products/${shop.product.id}`, { barcode: BARCODE });
  expect(set.status, JSON.stringify(set.body)).toBeLessThan(300);
  const opened = await api(shop.token, 'POST', '/shifts/open', { storeId: shop.storeId, openingFloat: 0 });
  expect(opened.status, JSON.stringify(opened.body)).toBeLessThan(300);
});
test.afterAll(async () => {
  if (shop) await dropShop(shop);
});

/** What a scanner does: the whole code a few ms per character, then Enter. */
async function scanWithScanner(page: import('@playwright/test').Page) {
  await page.keyboard.type(BARCODE, { delay: 4 });
  await page.keyboard.press('Enter');
}

test('a scan with nothing focused, or in another field, still rings the item up', async ({ page }) => {
  await ignorePrinting(page);
  await signIn(page, shop, '/pos');
  await expect(page.getByRole('button', { name: `Add ${shop.product.name}`, exact: true })).toBeVisible();

  // Nothing focused.
  await page.getByRole('heading', { name: 'Point of Sale' }).click();
  await scanWithScanner(page);
  await expect(page.getByRole('button', { name: /Complete Sale · .*100\.00/ })).toBeVisible();

  // The cashier was typing the tendered amount when the next item came.
  const tendered = page.getByLabel('Amount tendered');
  await tendered.click();
  await tendered.pressSequentially('500', { delay: 120 });
  await scanWithScanner(page);
  await expect(page.getByRole('button', { name: /Complete Sale · .*200\.00/ })).toBeVisible();
  await expect(tendered).toHaveValue('500');
});
