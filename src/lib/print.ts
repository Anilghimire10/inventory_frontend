import type { ReturnResult, Sale, ShiftReport, SubscriptionReceipt } from '@/types';
import { renderBarcodeSvg } from './barcode';
import { splitTax } from './tax';
import { CASH_REASON_LABEL } from './cash';
import { TENDER_LABEL } from './payment-methods';

export type PrintFormat = 'thermal' | 'a4';

function money(currency: string, v: number | string) {
  const n = typeof v === 'string' ? Number(v) : v;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  );

/**
 * The serial / IMEI numbers that went out on a line, for the customer's
 * warranty. All units of the product on the sale, returned ones included:
 * the receipt is a record of what was sold.
 */
const serialsOf = (sale: Sale, productId: string) =>
  (sale.serials ?? []).filter((u) => u.productId === productId).map((u) => u.serialNumber);

/** Label suffix for a tax row when the prices already contained it. */
const inclSuffix = (sale: Sale) => (sale.taxInclusive ? ' incl.' : '');

/** Build a per-rate tax breakdown from the sale's line items. */
function taxBreakdown(sale: Sale) {
  const map = new Map<number, { taxable: number; tax: number }>();
  for (const it of sale.items) {
    const rate = Number(it.taxRate ?? 0);
    const amount = Number(it.quantity) * Number(it.unitPrice) - Number(it.discount ?? 0);
    const { net, tax } = splitTax(amount, rate, !!sale.taxInclusive);
    const cur = map.get(rate) ?? { taxable: 0, tax: 0 };
    cur.taxable += net;
    cur.tax += tax;
    map.set(rate, cur);
  }
  return [...map.entries()]
    .filter(([rate]) => rate > 0)
    .map(([rate, v]) => ({ rate, taxable: v.taxable, tax: v.tax }));
}

function shell(title: string, pageCss: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { ${pageCss} }
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, Arial, sans-serif; color: #111; margin: 0; }
  table { width: 100%; border-collapse: collapse; }
  .r { text-align: right; } .c { text-align: center; }
  .muted { color: #555; }
</style></head>
<body>${body}
<script>window.onload=function(){window.focus();window.print();};window.onafterprint=function(){window.close();};</script>
</body></html>`;
}

export function printSale(sale: Sale, format: PrintFormat = 'thermal') {
  const currency = sale.business?.currency ?? 'USD';
  const m = (v: number | string) => money(currency, v);
  const taxes = taxBreakdown(sale);
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) {
    alert('Please allow pop-ups to print receipts.');
    return;
  }
  const html = format === 'thermal' ? thermal(sale, m, taxes) : invoiceA4(sale, m, taxes);
  w.document.write(html);
  w.document.close();
}

function thermal(
  sale: Sale,
  m: (v: number | string) => string,
  taxes: { rate: number; taxable: number; tax: number }[],
) {
  const incl = inclSuffix(sale);
  const biz = sale.business?.name ?? 'Receipt';
  const rows = sale.items
    .map(
      (it) => `
      <tr><td colspan="2">${esc(it.name)}</td></tr>
      <tr class="muted"><td>${it.quantity} × ${m(it.unitPrice)}</td><td class="r">${m(it.lineTotal)}</td></tr>${
        serialsOf(sale, it.productId).length
          ? `<tr class="muted"><td colspan="2" style="font-size:10px">S/N: ${serialsOf(sale, it.productId).map(esc).join(', ')}</td></tr>`
          : ''
      }`,
    )
    .join('');
  const taxLines = taxes
    .map((t) => `<tr class="muted"><td>VAT ${t.rate}%${incl}</td><td class="r">${m(t.tax)}</td></tr>`)
    .join('');
  const body = `
    <div style="width:72mm;padding:2mm;font-size:11px">
      <div class="c" style="font-weight:700;font-size:14px">${esc(biz)}</div>
      ${sale.store?.address ? `<div class="c muted">${esc(sale.store.address)}</div>` : ''}
      ${sale.store?.phone ? `<div class="c muted">${esc(sale.store.phone)}</div>` : ''}
      ${sale.business?.showTaxIdOnBill && sale.business?.taxId ? `<div class="c muted">VAT/PAN: ${esc(sale.business.taxId)}</div>` : ''}
      <hr/>
      <div>Receipt: <b>${esc(sale.receiptNo)}</b></div>
      <div class="muted">${new Date(sale.createdAt).toLocaleString()}</div>
      <div class="muted">Customer: ${esc(sale.customer?.name ?? 'Walk-in')}</div>
      <hr/>
      <table>${rows}</table>
      <hr/>
      <table>
        <tr class="muted"><td>Subtotal</td><td class="r">${m(sale.subtotal)}</td></tr>
        ${Number(sale.discount) > 0 ? `<tr class="muted"><td>Discount</td><td class="r">- ${m(sale.discount)}</td></tr>` : ''}
        ${taxLines}
        <tr><td style="font-weight:700">TOTAL</td><td class="r" style="font-weight:700">${m(sale.total)}</td></tr>
        <tr class="muted"><td>Paid (${esc(sale.paymentMethod ?? 'CASH')})</td><td class="r">${m(sale.amountPaid)}</td></tr>
      </table>
      <hr/>
      <div class="c muted">Thank you!</div>
    </div>`;
  return shell(`Receipt ${sale.receiptNo}`, 'size: 80mm auto; margin: 3mm;', body);
}

/** What a return slip lists: the lines that came back, and why. */
export interface ReturnSlip {
  result: ReturnResult;
  lines: { name: string; quantity: number; damaged: boolean; serials?: string[] }[];
  reason?: string;
}

const METHOD_LABEL: Record<string, string> = {
  CASH: 'cash',
  CARD: 'card',
  MOBILE: 'mobile',
  KHALTI: 'Khalti',
  CONNECTIPS: 'connectIPS',
};

/**
 * A return slip (credit note) for the customer: which receipt the goods came
 * back against, what came back, and where the money went -- off what they
 * owe, back in their hand, or both.
 */
export function printReturnSlip(sale: Sale, slip: ReturnSlip) {
  const m = (v: number | string) => money(sale.business?.currency ?? 'USD', v);
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) {
    alert('Please allow pop-ups to print receipts.');
    return;
  }
  const { result } = slip;
  const rows = slip.lines
    .map(
      (l) => `
      <tr><td>${esc(l.name)}${l.damaged ? ' <span class="muted">(damaged)</span>' : ''}</td><td class="r">× ${esc(l.quantity)}</td></tr>
      ${l.serials?.length ? `<tr class="muted"><td colspan="2">${l.serials.map(esc).join(', ')}</td></tr>` : ''}`,
    )
    .join('');
  const body = `
    <div style="width:72mm;padding:2mm;font-size:11px">
      <div class="c" style="font-weight:700;font-size:14px">${esc(sale.business?.name ?? 'Return')}</div>
      ${sale.store?.address ? `<div class="c muted">${esc(sale.store.address)}</div>` : ''}
      <div class="c" style="font-weight:700;margin-top:2mm">RETURN / CREDIT NOTE</div>
      <hr/>
      <div>Against receipt: <b>${esc(sale.receiptNo)}</b></div>
      <div class="muted">${new Date().toLocaleString()}</div>
      <div class="muted">Customer: ${esc(sale.customer?.name ?? 'Walk-in')}</div>
      ${slip.reason ? `<div class="muted">Reason: ${esc(slip.reason)}</div>` : ''}
      <hr/>
      <table>${rows}</table>
      <hr/>
      <table>
        <tr class="muted"><td>Value returned</td><td class="r">${m(result.refund)}</td></tr>
        ${result.creditCancelled > 0 ? `<tr class="muted"><td>Taken off balance owed</td><td class="r">- ${m(result.creditCancelled)}</td></tr>` : ''}
        <tr><td style="font-weight:700">REFUNDED${result.cashBack > 0 && result.method ? ` (${esc(METHOD_LABEL[result.method] ?? result.method)})` : ''}</td><td class="r" style="font-weight:700">${m(result.cashBack)}</td></tr>
      </table>
      <hr/>
      <div class="c muted">Keep this slip with your receipt.</div>
    </div>`;
  w.document.write(shell(`Return ${sale.receiptNo}`, 'size: 80mm auto; margin: 3mm;', body));
  w.document.close();
}

/**
 * Printable shift report. An open shift prints as an X report -- a read-only
 * mid-shift snapshot with no drawer count, so it can be taken as often as
 * needed and settles nothing. A closed one prints as the Z report: same
 * figures, plus the counted cash and variance recorded at close.
 */
export function printShiftReport(
  shift: ShiftReport,
  opts: { businessName: string; storeName?: string; currency: string },
) {
  const m = (v: number | string) => money(opts.currency, v);
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) {
    alert('Please allow pop-ups to print reports.');
    return;
  }
  const isX = shift.isOpen;
  const variance = shift.variance ?? 0;
  const varianceLabel = variance === 0 ? 'Balanced' : variance > 0 ? 'Over' : 'Short';
  // Blind close: a cashier's copy carries no expected figure or variance.
  const blind = shift.expectedCash === null;
  const movementRows = (shift.movements ?? [])
    .map(
      (mv) =>
        `<tr class="muted"><td>${mv.type === 'PAY_IN' ? 'In' : 'Out'}: ${esc(CASH_REASON_LABEL[mv.reason])}${mv.note ? ` — ${esc(mv.note)}` : ''}<br/><span style="font-size:9px">${new Date(mv.createdAt).toLocaleTimeString()} · ${esc(mv.user?.name ?? '')}</span></td><td class="r">${mv.type === 'PAY_IN' ? '+' : '-'}${m(mv.amount)}</td></tr>`,
    )
    .join('');
  const openingDiff =
    shift.carriedFloat === null ? 0 : Number(shift.openingFloat) - shift.carriedFloat;
  const cashCountRows = shift.cashCount
    ? Object.entries(shift.cashCount)
        .sort(([a], [b]) => Number(b) - Number(a))
        .map(([d, q]) => `<tr class="muted"><td>${esc(d)} × ${q}</td><td class="r">${m(Number(d) * q)}</td></tr>`)
        .join('')
    : '';
  const tenderRows = shift.byTender
    .map((t) => `<tr class="muted"><td>${esc(TENDER_LABEL[t.method] ?? t.method)} (${t.count})</td><td class="r">${m(t.amount)}</td></tr>`)
    .join('');
  const body = `
    <div style="width:72mm;padding:2mm;font-size:11px">
      <div class="c" style="font-weight:700;font-size:14px">${esc(opts.businessName)}</div>
      ${opts.storeName ?? shift.store?.name ? `<div class="c muted">${esc(opts.storeName ?? shift.store!.name)}</div>` : ''}
      <div class="c" style="font-weight:700;margin-top:4px">${isX ? 'X REPORT — SHIFT IN PROGRESS' : 'Z REPORT — SHIFT CLOSE'}</div>
      <hr/>
      <div>Cashier: <b>${esc(shift.user?.name ?? '—')}</b></div>
      <div class="muted">Opened: ${new Date(shift.openedAt).toLocaleString()}</div>
      ${
        isX
          ? `<div class="muted">Printed: ${new Date().toLocaleString()}</div>`
          : `<div class="muted">Closed: ${shift.closedAt ? new Date(shift.closedAt).toLocaleString() : '—'}</div>`
      }
      <hr/>
      <table>
        <tr class="muted"><td>Opening float</td><td class="r">${m(shift.openingFloat)}</td></tr>
        ${
          openingDiff !== 0
            ? `<tr class="muted"><td>Last shift left ${m(shift.carriedFloat ?? 0)} — opened ${openingDiff < 0 ? 'short' : 'over'}</td><td class="r">${m(Math.abs(openingDiff))}</td></tr>`
            : ''
        }
        ${tenderRows}
        ${
          shift.creditCollected
            ? `<tr class="muted"><td>Credit collected (cash)</td><td class="r">${m(shift.creditCollected)}</td></tr>`
            : ''
        }
        ${shift.payIns ? `<tr class="muted"><td>Paid in</td><td class="r">+${m(shift.payIns)}</td></tr>` : ''}
        ${shift.payOuts ? `<tr class="muted"><td>Paid out</td><td class="r">-${m(shift.payOuts)}</td></tr>` : ''}
        <tr class="muted"><td>Discounts</td><td class="r">-${m(shift.discounts)}</td></tr>
        <tr class="muted"><td>Refunds</td><td class="r">-${m(shift.refunds)}</td></tr>
        <tr class="muted"><td>${shift.salesCount} sale${shift.salesCount !== 1 ? 's' : ''} · gross</td><td class="r">${m(shift.gross)}</td></tr>
        ${
          (shift.byUser?.length ?? 0) > 1
            ? shift.byUser
                .map((u) => `<tr class="muted"><td>&nbsp;&nbsp;${esc(u.name)} (${u.count})</td><td class="r">${m(u.amount)}</td></tr>`)
                .join('')
            : ''
        }
      </table>
      ${movementRows ? `<hr/><div style="font-weight:700">Cash in / out</div><table>${movementRows}</table>` : ''}
      <hr/>
      <table>
        ${blind ? '' : `<tr style="font-weight:700"><td>Expected cash</td><td class="r">${m(shift.expectedCash ?? 0)}</td></tr>`}
        ${
          isX
            ? ''
            : `<tr style="font-weight:700"><td>Counted cash</td><td class="r">${m(shift.countedCash ?? 0)}</td></tr>
        ${blind ? '' : `<tr style="font-weight:700"><td>${varianceLabel}</td><td class="r">${m(Math.abs(variance))}</td></tr>`}`
        }
        ${
          !isX && shift.cashLeft !== null
            ? `<tr class="muted"><td>Left for next shift</td><td class="r">${m(shift.cashLeft)}</td></tr>
        <tr class="muted"><td>Taken out of drawer</td><td class="r">${m((shift.countedCash ?? 0) - shift.cashLeft)}</td></tr>`
            : ''
        }
      </table>
      ${cashCountRows ? `<hr/><div class="muted">Counted by notes</div><table>${cashCountRows}</table>` : ''}
      ${shift.note ? `<hr/><div class="muted">Note: ${esc(shift.note)}</div>` : ''}
      ${isX ? '<hr/><div class="c muted">Shift still open — drawer not counted.</div>' : ''}
    </div>`;
  const title = isX
    ? `X Report ${new Date().toLocaleDateString()}`
    : `Z Report ${new Date(shift.closedAt ?? shift.openedAt).toLocaleDateString()}`;
  w.document.write(shell(title, 'size: 80mm auto; margin: 3mm;', body));
  w.document.close();
}

export interface LabelItem {
  name: string;
  barcode: string;
  price?: string;
  sku?: string | null;
}

/** A sheet of scannable, printable product labels -- one label per unit to stick on stock. */
export function printLabelSheet(items: LabelItem[]) {
  const w = window.open('', '_blank', 'width=800,height=600');
  if (!w) {
    alert('Please allow pop-ups to print labels.');
    return;
  }
  const labels = items
    .map(
      (it) => `
      <div style="width:50mm;height:30mm;border:1px dashed #ccc;padding:2mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;box-sizing:border-box;page-break-inside:avoid">
        <div style="font-size:10px;font-weight:600;line-height:1.15;max-height:22px;overflow:hidden">${esc(it.name)}</div>
        <div style="width:100%;height:32px">${renderBarcodeSvg(it.barcode)}</div>
        <div style="font-size:8px;letter-spacing:1px;color:#333">${esc(it.barcode)}</div>
        ${it.price ? `<div style="font-size:12px;font-weight:700;margin-top:1mm">${esc(it.price)}</div>` : ''}
      </div>`,
    )
    .join('');
  const body = `<div style="display:flex;flex-wrap:wrap;gap:2mm">${labels}</div>`;
  w.document.write(shell('Product Labels', 'size: A4; margin: 8mm;', body));
  w.document.close();
}

function invoiceA4(
  sale: Sale,
  m: (v: number | string) => string,
  taxes: { rate: number; taxable: number; tax: number }[],
) {
  const incl = inclSuffix(sale);
  const biz = sale.business?.name ?? 'Invoice';
  const showPan = !!(sale.business?.showTaxIdOnBill && sale.business?.taxId);
  const due = Math.max(0, Number(sale.total) - Number(sale.amountPaid));
  const cust = sale.customer;
  const rows = sale.items
    .map(
      (it, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(it.name)}${
          serialsOf(sale, it.productId).length
            ? `<div class="muted" style="font-size:11px">S/N: ${serialsOf(sale, it.productId).map(esc).join(', ')}</div>`
            : ''
        }</td>
        <td class="r">${it.quantity}</td>
        <td class="r">${m(it.unitPrice)}</td>
        <td class="r">${Number(it.discount) > 0 ? m(it.discount) : '—'}</td>
        <td class="r">${Number(it.taxRate) || 0}%</td>
        <td class="r">${m(it.lineTotal)}</td>
      </tr>`,
    )
    .join('');
  const taxLines = taxes
    .map(
      (t) =>
        `<tr><td class="r muted" colspan="2">VAT ${t.rate}%${incl} (on ${m(t.taxable)})</td><td class="r">${m(t.tax)}</td></tr>`,
    )
    .join('');
  const body = `
    <div style="font-size:13px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-size:22px;font-weight:700">${esc(biz)}</div>
          ${sale.store?.name ? `<div class="muted">${esc(sale.store.name)}</div>` : ''}
          ${sale.store?.address ? `<div class="muted">${esc(sale.store.address)}</div>` : ''}
          ${sale.store?.phone ? `<div class="muted">${esc(sale.store.phone)}</div>` : ''}
          ${showPan ? `<div class="muted">VAT/PAN: ${esc(sale.business!.taxId)}</div>` : ''}
        </div>
        <div class="r">
          <div style="font-size:20px;font-weight:700">INVOICE</div>
          <div class="muted">${esc(sale.receiptNo)}</div>
          <div class="muted">${new Date(sale.createdAt).toLocaleString()}</div>
          <div class="muted">Payment: ${esc(sale.paymentMethod ?? 'CASH')}</div>
        </div>
      </div>
      <div style="margin:16px 0">
        <div class="muted" style="font-size:11px;text-transform:uppercase">Bill to</div>
        <div style="font-weight:600">${esc(cust?.name ?? 'Walk-in customer')}</div>
        ${cust?.phone ? `<div class="muted">${esc(cust.phone)}</div>` : ''}
        ${cust?.email ? `<div class="muted">${esc(cust.email)}</div>` : ''}
        ${cust?.address ? `<div class="muted">${esc(cust.address)}</div>` : ''}
      </div>
      <table>
        <thead>
          <tr style="border-bottom:2px solid #111;text-align:left">
            <th style="padding:6px 4px">#</th><th>Item</th>
            <th class="r">Qty</th><th class="r">Price</th><th class="r">Disc</th><th class="r">Tax</th><th class="r">Total</th>
          </tr>
        </thead>
        <tbody>${rows.replace(/<td/g, '<td style="padding:6px 4px;border-bottom:1px solid #ddd"')}</tbody>
      </table>
      <div style="display:flex;justify-content:flex-end;margin-top:12px">
        <table style="width:320px">
          <tr><td class="r muted" colspan="2">Subtotal</td><td class="r">${m(sale.subtotal)}</td></tr>
          ${Number(sale.discount) > 0 ? `<tr><td class="r muted" colspan="2">Discount</td><td class="r">- ${m(sale.discount)}</td></tr>` : ''}
          ${taxLines || `<tr><td class="r muted" colspan="2">Tax${incl}</td><td class="r">${m(sale.tax)}</td></tr>`}
          <tr style="border-top:2px solid #111"><td class="r" colspan="2" style="font-weight:700;padding-top:6px">Total</td><td class="r" style="font-weight:700;padding-top:6px">${m(sale.total)}</td></tr>
          <tr><td class="r muted" colspan="2">Paid (${esc(sale.paymentMethod ?? 'CASH')})</td><td class="r">${m(sale.amountPaid)}</td></tr>
          ${due > 0 ? `<tr><td class="r" colspan="2" style="font-weight:700;color:#b00">Balance due</td><td class="r" style="font-weight:700;color:#b00">${m(due)}</td></tr>` : ''}
        </table>
      </div>
      <p class="muted" style="margin-top:24px;text-align:center">Thank you for your business.</p>
    </div>`;
  return shell(`Invoice ${sale.receiptNo}`, 'size: A4; margin: 16mm;', body);
}

/**
 * A subscription receipt, A4: who was paid (the platform), who paid, for
 * which period, how much. The same layout the admin panel prints, so a shop
 * and the platform hold identical copies.
 *
 * Takes a loader, not the receipt: the window opens on the click itself, then
 * fills in. Opened after awaiting the fetch, browsers count it as an
 * unrequested pop-up and block it.
 */
export async function printSubscriptionReceipt(load: () => Promise<SubscriptionReceipt>) {
  const w = window.open('', '_blank', 'width=720,height=900');
  if (!w) {
    alert('Please allow pop-ups to print the receipt.');
    return;
  }
  w.document.write('<p style="font-family:system-ui,sans-serif;color:#555;padding:24px">Loading receipt…</p>');
  let r: SubscriptionReceipt;
  try {
    r = await load();
  } catch (e) {
    w.close();
    throw e;
  }
  w.document.open();
  const day = (iso: string) => new Date(iso).toISOString().slice(0, 10);
  const contact = [r.seller.phone, r.seller.email].filter(Boolean).map(esc).join(' · ');
  const seller = [
    r.seller.name && `<div style="font-size:18px;font-weight:700;color:#0f172a">${esc(r.seller.name)}</div>`,
    r.seller.address && `<div>${esc(r.seller.address)}</div>`,
    contact && `<div>${contact}</div>`,
    r.seller.taxId && `<div>PAN/VAT: ${esc(r.seller.taxId)}</div>`,
  ]
    .filter(Boolean)
    .join('');
  const row = (label: string, value: string) =>
    `<tr><td style="padding:8px 0;color:#475569">${label}</td><td style="padding:8px 0;text-align:right">${value}</td></tr>`;
  const amount = `${esc(r.currency)} ${r.amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  const body = `<div style="padding:4mm;font-size:14px;color:#0f172a">
  <div style="display:flex;justify-content:space-between;gap:24px;align-items:flex-start">
    <div style="color:#475569;line-height:1.5">${seller}</div>
    <div style="text-align:right">
      <div style="font-size:22px;font-weight:700">RECEIPT</div>
      <div style="color:#475569">${esc(r.receiptNo)}</div>
      <div style="color:#475569">${day(r.issuedAt)}</div>
    </div>
  </div>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
  <div style="color:#475569">Received from</div>
  <div style="font-size:16px;font-weight:600">${esc(r.buyer.name)}</div>
  ${r.buyer.taxId ? `<div style="color:#475569">PAN/VAT: ${esc(r.buyer.taxId)}</div>` : ''}
  <table style="margin-top:20px">
    ${row('For', 'Subscription')}
    ${row('Period', `${day(r.periodFrom)} to ${day(r.periodTo)}`)}
    ${row('Paid by', esc(r.methodLabel))}
    ${r.reference ? row('Reference', esc(r.reference)) : ''}
    <tr>
      <td style="padding:12px 0 0;border-top:2px solid #0f172a;font-weight:700;font-size:16px">Amount received</td>
      <td style="padding:12px 0 0;border-top:2px solid #0f172a;text-align:right;font-weight:700;font-size:16px">${amount}</td>
    </tr>
  </table>
  <p style="margin-top:40px;color:#94a3b8;font-size:12px">Thank you for your payment.</p>
</div>`;
  w.document.write(shell(`Receipt ${r.receiptNo}`, 'size: A4; margin: 18mm;', body));
  w.document.close();
}
