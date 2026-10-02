import { expect, test } from '@playwright/test';
import { api, dropShop, makeShop, signIn, type TestShop } from './helpers';

// Stock that moves without a sale: a manual adjustment, a stock take, and a
// reorder level that puts the product on the low-stock list. In order, each
// starting from the quantity the last one left.
test.describe.configure({ mode: 'serial' });

let shop: TestShop;

test.beforeAll(async () => {
  shop = await makeShop('Inventory', 10);
});
test.afterAll(async () => {
  if (shop) await dropShop(shop);
});

async function onHand() {
  const res = await api<{ data: { onHandQty: number | string }[] }>(
    shop.token,
    'GET',
    `/products?ids=${shop.product.id}&storeId=${shop.storeId}&limit=1`,
  );
  return Number(res.body.data[0].onHandQty);
}

const row = (page: import('@playwright/test').Page) =>
  page.getByRole('row').filter({ hasText: shop.product.name });

test('adjust stock by hand, and see it in the history', async ({ page }) => {
  await signIn(page, shop, '/inventory');
  await row(page).getByRole('button', { name: 'Adjust' }).click();
  const dialog = page.getByRole('dialog', { name: 'Adjust stock' });
  await dialog.getByLabel('Change (use negative to remove)').fill('5');
  await dialog.getByLabel('Reason').selectOption('OTHER');
  await dialog.getByRole('button', { name: 'Apply' }).click();

  await expect(page.getByText('Stock adjusted')).toBeVisible();
  await expect(row(page)).toContainText('15');
  expect(await onHand()).toBe(15);

  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page).toHaveURL(/tab=movements/);
  // The setup's +10 is there too; this is the +5.
  await expect(row(page).filter({ hasText: 'ADJUSTMENT' }).filter({ hasText: '+5' })).toBeVisible();
});

test('a stock take posts only what differs', async ({ page }) => {
  await signIn(page, shop, '/inventory?tab=stockTake');
  await page.getByLabel(`Counted ${shop.product.name}`).fill('14');
  await expect(page.getByText(/1 of \d+ items? differ/)).toBeVisible();
  await page.getByRole('button', { name: 'Review stock take' }).click();

  const review = page.getByRole('dialog', { name: 'Review stock take' });
  await expect(review.getByRole('row').filter({ hasText: shop.product.name })).toContainText('-1');
  await review.getByRole('button', { name: 'Post stock take' }).click();
  await expect(page.getByText('Stock take posted')).toBeVisible();
  expect(await onHand()).toBe(14);
});

test('a reorder level puts the product on the low-stock and reorder lists', async ({ page }) => {
  await signIn(page, shop, '/inventory');
  await row(page).getByRole('button', { name: 'Reorder level' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reorder level' });
  await dialog.getByLabel('Reorder at').fill('20');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Reorder level updated')).toBeVisible();

  await page.getByRole('tab', { name: 'Low stock' }).click();
  await expect(row(page)).toBeVisible();

  await page.getByRole('tab', { name: 'Reorder', exact: true }).click();
  await expect(page.getByText(/below\s+reorder level/)).toBeVisible();
  await expect(row(page)).toBeVisible();

  // Nothing here is batch- or serial-tracked, so those tabs are empty.
  await page.getByRole('tab', { name: 'Expiring' }).click();
  await expect(page.getByText('Nothing expiring soon')).toBeVisible();
  await page.getByRole('tab', { name: 'Serials' }).click();
  await expect(page.getByText('No serials found')).toBeVisible();
});
