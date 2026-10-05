import { expect, test } from '@playwright/test';
import { api, dropShop, makeShop, signIn, type TestShop } from './helpers';

let shop: TestShop;
let plans: { id: string; name: string; prices: { months: number; amount: number }[] }[] = [];

test.beforeAll(async () => {
  shop = await makeShop('Subscription', 1);
  const sub = await api<{ plans: typeof plans }>(shop.token, 'GET', '/subscription');
  plans = sub.body.plans;
});
test.afterAll(async () => {
  if (shop) await dropShop(shop);
});

test('pick a plan, report a payment made by QR, and withdraw the report', async ({ page }) => {
  test.skip(plans.length === 0, 'No plans set up in the admin panel, so there is nothing to choose');
  const plan = plans[plans.length - 1];
  const price = plan.prices[0];

  await signIn(page, shop, '/subscription');
  await expect(page.getByRole('radiogroup', { name: 'Plan' })).toBeVisible();
  await page.getByRole('radio', { name: new RegExp(plan.name) }).click();
  await expect(page.getByText(`For the ${plan.name} plan.`)).toBeVisible();
  await expect(page.getByText(/You pay .* for .* of/)).toContainText(plan.name);

  // "I've paid": the details go to the admins to check against the statement.
  await page.getByRole('button', { name: "I've paid" }).click();
  await page.getByLabel(/Amount paid/).fill(String(price.amount));
  await page.getByLabel('Paid by').selectOption('ESEWA');
  // eSewa needs its transaction ID; without it the report is refused here.
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText('Add the transaction ID or bank reference')).toBeVisible();
  await page.getByLabel('Transaction ID').fill('E2E0AB1CD2');
  await page.getByRole('button', { name: 'Send report' }).click();

  await expect(page.getByText('Waiting for us to confirm')).toBeVisible();
  await expect(page.getByText(/by eSewa/)).toContainText('ref E2E0AB1CD2');

  await page.getByRole('button', { name: 'Withdraw this report' }).click();
  await expect(page.getByText('Report withdrawn')).toBeVisible();
  await expect(page.getByRole('button', { name: "I've paid" })).toBeVisible();
});
