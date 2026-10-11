import { expect, test } from '@playwright/test';
import { dropShop, makeShop, signIn, type TestShop } from './helpers';

// Variants from the product dialog: values entered as chips, a preview of
// exactly what will be created, and the list in shelf order (S before M).
let shop: TestShop;
test.beforeAll(async () => {
  shop = await makeShop('Variants', 1);
});
test.afterAll(async () => {
  if (shop) await dropShop(shop);
});

test('create sizes and colours from a preview, listed in shelf order', async ({ page }) => {
  await signIn(page, shop, '/products');
  await page.getByRole('button', { name: `Edit ${shop.product.name}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit product' });
  const variants = dialog.getByTestId('variants');

  await variants.getByRole('button', { name: 'Create variants' }).click();
  await variants.getByLabel('Attribute 1 name').fill('Size');
  await variants.getByLabel('Size values').fill('M, S,');
  await variants.getByRole('button', { name: '+ Add another attribute' }).click();
  await variants.getByLabel('Attribute 2 name').fill('Colour');
  await variants.getByLabel('Colour values').fill('Red');
  await variants.getByLabel('Colour values').press('Enter');

  await expect(variants.getByText('Will create 2 new:')).toBeVisible();
  // Enter added a value; it must not have submitted the product form.
  await expect(dialog).toBeVisible();
  await variants.getByRole('button', { name: 'Create 2 variants' }).click();

  const rows = variants.getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Red · S');
  await expect(rows.nth(1)).toContainText('Red · M');
  await expect(rows.nth(0)).toContainText('Out of stock');

  // Adding a value previews only what is missing.
  await variants.getByRole('button', { name: 'Add variants' }).click();
  await variants.getByLabel('Size values').fill('S, L,');
  await variants.getByLabel('Colour values').fill('Red,');
  await expect(variants.getByText('Will create 1 new (1 already exist):')).toBeVisible();
});
