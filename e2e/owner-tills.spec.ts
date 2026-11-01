import { expect, test, type Page } from '@playwright/test';
import { API, api, dropShop, ignorePrinting, makeCounter, makeShop, signIn, type TestShop } from './helpers';

// An owner chooses which till to work on: a cashier's counter, another
// owner's, or a free counter of their own -- and every sale and every cash
// refund then lands in the drawer they chose. The store opens with Counter 1;
// the cashier is assigned "Till a", set up before they were added.
test.describe.configure({ mode: 'serial' });

let shop: TestShop;
let cashierTill: string;
let ownTill: string;
let otherOwnerTill: string;

async function signInAs(label: string, role: 'CASHIER' | 'OWNER') {
  const stamp = `${label}-${Date.now().toString(36)}`;
  const email = `e2e+${stamp}@example.com`;
  const password = `E2e-password-${stamp}`;
  const made = await api(shop.token, 'POST', '/users', {
    email,
    name: role === 'OWNER' ? `Owner ${label}` : `Cashier ${label}`,
    password,
    role,
    ...(role === 'CASHIER' ? { storeId: shop.storeId, counterId: await makeCounter(shop, `Till ${label}`) } : {}),
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'shop-e2e' },
    body: JSON.stringify({ email, password }),
  });
  return ((await res.json()) as { accessToken: string }).accessToken;
}

type Till = { id: string; isOwnShift: boolean; openedBy: { name: string; role?: string } };
const openTills = async () =>
  (await api<Till[]>(shop.token, 'GET', `/shifts/open?storeId=${shop.storeId}`)).body;
const report = async (id: string) =>
  (await api<{ salesCount: number; cashRefunds: number }>(shop.token, 'GET', `/shifts/${id}/report`)).body;

/**
 * Ring up one unit in cash. `previous` is the last sale's receipt: its
 * "completed" toast can still be on screen, and waiting for any such toast
 * returned before this sale had gone through.
 */
async function sellOne(page: Page, previous?: string) {
  await page.getByRole('button', { name: `Add ${shop.product.name}`, exact: true }).click();
  await page.getByLabel('Amount tendered').fill('100');
  await page.getByRole('button', { name: /Complete Sale/ }).click();
  const done = page.getByText(previous ? new RegExp(`Sale (?!${previous} )\\S+ completed`) : /Sale .+ completed/);
  await expect(done).toBeVisible();
  return (await done.innerText()).match(/Sale (\S+) completed/)![1];
}

test.beforeAll(async () => {
  shop = await makeShop('Owner tills', 20);
  const cashier = await signInAs('a', 'CASHIER');
  const opened = await api<{ id: string }>(cashier, 'POST', '/shifts/open', { storeId: shop.storeId, openingFloat: 1000 });
  expect(opened.status, JSON.stringify(opened.body)).toBe(201);
  cashierTill = opened.body.id;
});
test.afterAll(async () => {
  if (shop) await dropShop(shop);
});

test('with one till open, the owner is asked: work on it, or open their own', async ({ page }) => {
  await ignorePrinting(page);
  await signIn(page, shop, '/pos');

  const dialog = page.getByRole('dialog', { name: 'Which till will you work on?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Open Counter 1/ })).toBeVisible();
  // Work on the cashier's till, at their counter.
  await dialog.getByRole('button', { name: /Work on Till a · Cashier a.*’s till · Cashier/ }).click();
  await expect(dialog).toBeHidden();

  const first = await sellOne(page);
  expect((await report(cashierTill)).salesCount).toBe(1);

  // Then open the free counter from the header; the cashier's stays open.
  await page.getByLabel('Till').selectOption({ label: '+ Open a counter' });
  const own = page.getByRole('dialog', { name: 'Open a counter' });
  await own.getByLabel('Opening float').fill('300');
  await own.getByRole('button', { name: /Open Counter 1 with/ }).click();
  await expect(page.getByText('Your counter is open — the next sale goes into it')).toBeVisible();

  await sellOne(page, first);
  const tills = await openTills();
  expect(tills).toHaveLength(2);
  ownTill = tills.find((t) => t.isOwnShift)!.id;
  expect((await report(ownTill)).salesCount).toBe(1);
  expect((await report(cashierTill)).salesCount).toBe(1);
});

test("an owner works on another owner's till, and a cash refund comes out of that same till", async ({ page }) => {
  const otherOwner = await signInAs('sita', 'OWNER');
  const opened = await api<{ id: string }>(otherOwner, 'POST', '/shifts/open', {
    storeId: shop.storeId,
    openingFloat: 500,
    counterId: await makeCounter(shop, 'Counter 3'),
  });
  expect(opened.status, JSON.stringify(opened.body)).toBe(201);
  otherOwnerTill = opened.body.id;

  await ignorePrinting(page);
  await signIn(page, shop, '/pos');
  // On their own till already, so nothing to ask -- the header switches.
  const picker = page.getByLabel('Till');
  await expect(picker).toHaveValue(ownTill);
  const otherOption = picker.locator('option', { hasText: /Owner sita.*’s till · Owner/ });
  await picker.selectOption((await otherOption.getAttribute('value'))!);
  await expect(page.getByText(/Now selling into Counter 3 · Owner sita.*’s till · Owner/)).toBeVisible();

  const receiptNo = await sellOne(page);
  expect((await report(otherOwnerTill)).salesCount).toBe(1);

  // The refund screen starts from the till this device is working on.
  await page.goto('/sales');
  await page.getByRole('cell', { name: new RegExp(receiptNo) }).click();
  await page.getByText('Return items').click();
  await page.getByLabel(`How many ${shop.product.name} to return`).fill('1');
  const cashFrom = page.getByLabel('Cash comes out of');
  await expect(cashFrom).toHaveValue(otherOwnerTill);
  await page.getByRole('button', { name: 'Process return' }).click();
  await expect(page.getByText(/Return done — .*100\.00 handed back/)).toBeVisible();

  expect((await report(otherOwnerTill)).cashRefunds).toBe(100);
  expect((await report(ownTill)).cashRefunds).toBe(0);
  expect((await report(cashierTill)).cashRefunds).toBe(0);
});
