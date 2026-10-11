import { expect, test } from '@playwright/test';
import { api, dropShop, makeShop, signIn, type TestShop } from './helpers';

// A customer row opens their details: contact, what they have bought, what
// they owe, their latest sales, and the actions on them.
let shop: TestShop;
let receiptNo: string;

test.beforeAll(async () => {
  shop = await makeShop('Customers', 10);
  const till = await api<{ id: string }>(shop.token, 'POST', '/shifts/open', { storeId: shop.storeId, openingFloat: 0 });
  expect(till.status, JSON.stringify(till.body)).toBeLessThan(300);
  const customer = await api<{ id: string }>(shop.token, 'POST', '/customers', {
    name: 'E2E Regular',
    phone: '9800000001',
    email: 'regular@example.com',
  });
  expect(customer.status, JSON.stringify(customer.body)).toBe(201);
  // One paid sale of two units, one of a unit on credit.
  for (const [quantity, paymentMethod] of [[2, 'CASH'], [1, 'CREDIT']] as const) {
    const sale = await api<{ receiptNo: string }>(shop.token, 'POST', '/sales', {
      storeId: shop.storeId,
      shiftId: till.body.id,
      customerId: customer.body.id,
      items: [{ productId: shop.product.id, quantity }],
      paymentMethod,
      ...(paymentMethod === 'CREDIT' ? { amountPaid: 0 } : {}),
    });
    expect(sale.status, JSON.stringify(sale.body)).toBe(201);
    receiptNo = sale.body.receiptNo;
  }
});
test.afterAll(async () => {
  if (shop) await dropShop(shop);
});

test('a customer row opens their details, and its actions work from there', async ({ page }) => {
  await signIn(page, shop, '/customers');
  await page.getByRole('cell', { name: 'E2E Regular', exact: true }).click();

  const details = page.getByRole('dialog', { name: 'E2E Regular' });
  await expect(details).toBeVisible();
  await expect(details.getByText('regular@example.com')).toBeVisible();
  const stat = (label: string) => details.locator('dt', { hasText: label }).locator('xpath=following-sibling::dd');
  await expect(stat('Purchases')).toHaveText('2');
  await expect(stat('Spent in total')).toContainText('300.00');
  await expect(stat('Credit due')).toContainText('100.00');
  await expect(details.getByRole('cell', { name: receiptNo })).toBeVisible();
  await expect(details.getByText('On credit')).toBeVisible();

  // Record payment takes over from the details, with the amount due filled in.
  await details.getByRole('button', { name: 'Record payment' }).click();
  const payment = page.getByRole('dialog', { name: 'Record credit payment' });
  await expect(payment.getByLabel('Amount received')).toHaveValue('100');
  await payment.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByText('Payment recorded')).toBeVisible();

  // Opened again, the details show the debt cleared and offer no payment.
  await page.getByRole('cell', { name: 'E2E Regular', exact: true }).click();
  await expect(stat('Credit due')).toContainText('0.00');
  await expect(details.getByRole('button', { name: 'Record payment' })).toHaveCount(0);

  // A button in the row still does only its own thing.
  await details.getByRole('button', { name: 'Close' }).first().click();
  await page.getByRole('button', { name: 'Edit E2E Regular' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit customer' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'E2E Regular' })).toHaveCount(0);
});
