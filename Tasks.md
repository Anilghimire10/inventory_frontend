# Build Order — POS & Inventory

Ordered task list for the shop-facing product. Do them top to bottom; each one
is sized to be finishable and shippable on its own.

Scope note: this file covers **POS + inventory features only**. Launch/business
work (Fonepay, trial flow, ToS, hosting, backups) stays in `MVP_CHECKLIST.md`.

Legend: ⬜ not started · 🚧 in progress · ✅ done

---

## Phase 1 — Make it usable on a real counter

These three are what separate a demo from something a shop runs its day on.
All of them are missing today.

### ✅ 1. Cash tendered → change due

The cashier currently does mental math on every cash sale. Highest-frequency
operation in the whole app, and it isn't there.

- Add a **"Amount tendered"** input to the cart panel in
  `web/src/screens/PosPage.tsx`, shown when `payMode === 'full'` and tender is `CASH`.
- Show **Change due** = `tendered - total`, large and bold, above the checkout button.
- Quick-tender buttons for common notes (exact, 100, 500, 1000) — cuts keystrokes.
- Keep the change on screen after checkout succeeds until the next item is scanned.

No API work: `CreateSaleDto.amountPaid` already documents itself as "amount
tendered" (`api/src/sales/dto/create-sale.dto.ts:55`). Server clamps paid to
total, so tendered > total is safe to send — but prefer sending `undefined`
for a full cash sale and computing change client-side.

**Done when:** a cash sale for 870 with 1000 tendered shows "Change 130" without
the cashier touching a calculator.

---

### ⬜ 2. Hold / park a sale

`SaleStatus.HELD` exists in the schema and is filtered out of every report
(`api/src/reports/reports.service.ts` in 6 places, `platform.service.ts` in 2),
but **nothing ever creates a held sale**. It is a dead enum. A cashier cannot
suspend customer A's cart to serve customer B.

- `POST /sales/hold` — create a sale with `status: HELD`, **without** deducting stock.
- `GET /sales?status=HELD` — list held sales for the current store.
- `POST /sales/:id/resume` — return the cart lines, delete/void the held row.
- `DELETE /sales/:id` (held only) — discard a parked sale.
- POS: a "Hold" button next to checkout, and a held-sales tray showing count +
  customer + total, click to resume into the cart.

Careful: held sales must **not** touch stock, must **not** consume a receipt
number from `nextReceiptNo()`, and must stay excluded from every report (the
existing `status: { not: HELD }` filters already handle the last part).

**Done when:** a 6-item cart can be parked, a second sale completed, and the
first resumed with all lines, quantities, customer and discount intact.

---

### ⬜ 3. Shift / cash drawer session

Completely absent — zero references to shift, drawer, or X/Z report anywhere.
With `CASHIER` as a role, the owner has no way to tell whether the drawer
balances at end of day. This is the biggest accountability hole in the product
and the thing shop owners ask about during a demo.

**Schema** — new `Shift` model:
```
id, businessId, storeId, userId
openedAt, closedAt?
openingFloat   Decimal
countedCash?   Decimal   // what the cashier physically counted at close
expectedCash?  Decimal   // snapshot: float + cash sales - cash refunds
variance?      Decimal   // counted - expected
note?
```
Add `shiftId String?` to `Sale`, stamped on create from the user's open shift.

**API** — new `shifts` module:
- `POST /shifts/open` (opening float) — reject if the user already has an open shift.
- `GET /shifts/current` — the caller's open shift + running totals.
- `GET /shifts/:id/report` — X report (read-only mid-shift) / Z report (at close):
  sales count, gross, discounts, tax, split by tender, refunds, expected cash.
- `POST /shifts/:id/close` (counted cash) — compute expected + variance, stamp `closedAt`.
- `GET /shifts` — history, OWNER/MANAGER only.

**Web:**
- Prompt to open a shift on first POS visit of the day; block checkout until open.
- "Close shift" action → cash-count screen → printable Z report.
- Shift history under Analytics, owner/manager only, variance highlighted.

**Done when:** a cashier opens with a 5000 float, sells all day, counts the
drawer, and the Z report shows expected vs counted with the difference called out.

---

## Phase 2 — Decide before you have real data

### ⬜ 4. Decimal quantities (weighed goods)

`SaleItem.quantity`, `StockItem.quantity`, `Batch.quantity`,
`StockMovement.quantity` and `PurchaseItem.quantity` are all `Int`
(`api/prisma/schema.prisma`). You cannot sell 1.5 kg or 0.5 L today.

`GROCERY` is one of four `BusinessType` values and `unit` already defaults to
`"pcs"` — so the product is aimed at a market this blocks.

**This gets harder every day there is customer data.** Decide now:

- **If grocery / weighed goods are in scope:** migrate the columns above to
  `Decimal(12, 3)`, audit every place quantity is summed or compared
  (`inventory.service.ts:applyMovement`, `consumeBatchesFEFO`, reports
  aggregates), and switch the POS qty input to accept decimals for products
  whose `unit` is a weight/volume.
- **If not:** write the decision down here, and remove `GROCERY` from
  `BusinessType` so the marketing doesn't promise it.

**Done when:** either 1.5 kg sells correctly end to end (stock, receipt, reports,
profit), or the exclusion is documented and the enum reflects it.

---

## Phase 3 — Close the inventory gaps

### ⬜ 5. Stock transfer between stores

Multi-store is fully modeled (`Store`, `StockItem` keyed per store) but there is
**no transfer feature anywhere**. `StockMovementType.TRANSFER` is declared at
`api/prisma/schema.prisma:45` and **never used** — the enum value is waiting.

Today, moving stock between branches means an adjust-down in one store and an
adjust-up in the other, with nothing linking the two.

- `POST /inventory/transfer` — `{ fromStoreId, toStoreId, items[], note }`.
- One `$transaction`: two `applyMovement` calls per item (negative at source,
  positive at destination), both `type: TRANSFER`, sharing a `reference` id so
  the pair is traceable.
- Move batch quantities too when `product.trackBatches` — a transfer must not
  silently drop expiry data.
- Web: a Transfer action on the Inventory page + transfer history.

`applyMovement` is the single choke point for all stock changes, so this is
mostly wiring, not new mechanics.

**Done when:** 10 units move from Store A to Store B, both balances are correct,
and the movement history on each side references the same transfer.

---

### ⬜ 6. Purchase return / debit note

Sales returns exist (`POST /sales/:id/return`), supplier returns do not.
`StockMovementType.RETURN_OUT` is declared at `schema.prisma:44` and, like
TRANSFER, is **never used**.

- `POST /purchases/:id/return` — pick lines + quantities, stock out via
  `RETURN_OUT`, reduce the supplier payable.
- Mirror the sales-return shape in `sales.service.ts` (returnedQty per line,
  partial returns) — same problem, same solution.
- Web: a Return action on the purchase detail view.

**Done when:** damaged goods can go back to a supplier, stock drops, and the
payable on the Credit page drops by the same amount.

---

### ⬜ 7. Physical stock take

Only single-item adjust exists (`inventory.service.ts:90`). Counting a 500-SKU
shop one product at a time at month end is not viable.

- `POST /inventory/stock-take` — accept `{ storeId, counts: [{productId, counted}] }`,
  post one `ADJUSTMENT` movement per variance with reason `COUNT_CORRECTION`
  (already in `AdjustmentReason`), all in one transaction.
- Downloadable count sheet (CSV of current stock, blank counted column) and an
  upload of the filled sheet — reuses the existing bulk product CSV plumbing.
- Variance report before posting: show what will change, require confirmation.

**Done when:** a filled count sheet for 200 products posts in one action and the
activity log shows a single stock-take, not 200 loose adjustments.

---

## Phase 4 — POS polish (do together, one sprint)

### ⬜ 8. Line-level and percentage discounts
The API already accepts per-item `discount` (`CreateSaleDto.items[].discount`)
and per-item `unitPrice`; the POS UI exposes neither — only one flat bill-level
amount. Add a per-line discount/price-override control, and a %-or-amount toggle
on both line and bill discount.

### ✅ 9. Customer quick-create at POS
To sell on credit today, the cashier must leave POS, create the customer, and
come back — losing the cart. Add an inline "+ New customer" (name + phone) in
the customer dropdown.

### ✅ 10. Keyboard-first checkout
Cashiers use keyboards, not mice. Bind: focus search, change qty of last line,
tender/pay, hold, discount, print last receipt. Show the hints in a `?` overlay.

### ⬜ 11. POS product picker that scales
Flat list capped at 50 (`ProductsApi.list({ limit: 50 })`), no category filter,
no favorites. Fine at 50 SKUs, painful at 2000. Add category tabs and a
pinned/favorites grid for fast movers.

### ⬜ 12. Barcode label printing
You can scan barcodes (`ProductsApi.byBarcode`) but can't generate them, so
stock arriving unlabeled can never enter the scan flow. Add barcode generation
+ a printable label sheet from the Products page.

---

## Phase 5 — Bigger bets, after the above

### ⬜ 13. Offline-tolerant POS
No service worker or manifest in `web/`. Capacitor is wired for Android
(`web/package.json` → `build:mobile`, `android`), but the app still dies without
network. For markets with unreliable internet this is arguably a blocker rather
than a nice-to-have — revisit its priority once Phase 1–3 land.
Needs: cached product catalog, a local sale queue, sync-on-reconnect, and a
conflict story for stock that went negative while offline.

### ⬜ 14. Reorder suggestions / auto-PO
Low-stock alerts exist (`GET /inventory/low-stock`); acting on them is manual.
Generate a draft purchase per supplier from items below reorder level, using
last purchase price.

### ⬜ 15. Product variants
Size/colour variants each need their own product row today. Only worth building
if apparel/footwear becomes a target vertical.

### ⬜ 16. Serial / IMEI tracking
Batches exist, serials do not. Only for electronics.

---

## Not a feature, but overdue

### ⬜ 17. Tests
There are no tests in `api/` or `web/`. Before touching quantities (task 4) or
shifts (task 3), get at least the money paths covered: sale totals + tax, credit
split, returns, FEFO batch consumption. Those are the places a silent bug costs
a real shop real money.
