import type { Sale, ShiftReport } from '@/types';
import { renderBarcodeSvg } from './barcode';

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

/** Build a per-rate tax breakdown from the sale's line items. */
function taxBreakdown(sale: Sale) {
  const map = new Map<number, { taxable: number; tax: number }>();
  for (const it of sale.items) {
    const rate = Number(it.taxRate ?? 0);
    const lineNet = Number(it.quantity) * Number(it.unitPrice) - Number(it.discount ?? 0);
    const tax = Math.round(((lineNet * rate) / 100) * 100) / 100;
    const cur = map.get(rate) ?? { taxable: 0, tax: 0 };
    cur.taxable += lineNet;
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
  const biz = sale.business?.name ?? 'Receipt';
  const rows = sale.items
    .map(
      (it) => `
      <tr><td colspan="2">${esc(it.name)}</td></tr>
      <tr class="muted"><td>${it.quantity} × ${m(it.unitPrice)}</td><td class="r">${m(it.lineTotal)}</td></tr>`,
    )
    .join('');
  const taxLines = taxes
    .map((t) => `<tr class="muted"><td>VAT ${t.rate}%</td><td class="r">${m(t.tax)}</td></tr>`)
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
  const tenderRows = shift.byTender
    .map((t) => `<tr class="muted"><td>${esc(t.method)} (${t.count})</td><td class="r">${m(t.amount)}</td></tr>`)
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
        ${tenderRows}
        <tr class="muted"><td>Discounts</td><td class="r">-${m(shift.discounts)}</td></tr>
        <tr class="muted"><td>Refunds</td><td class="r">-${m(shift.refunds)}</td></tr>
        <tr class="muted"><td>${shift.salesCount} sale${shift.salesCount !== 1 ? 's' : ''} · gross</td><td class="r">${m(shift.gross)}</td></tr>
      </table>
      <hr/>
      <table>
        <tr style="font-weight:700"><td>Expected cash</td><td class="r">${m(shift.expectedCash)}</td></tr>
        ${
          isX
            ? ''
            : `<tr style="font-weight:700"><td>Counted cash</td><td class="r">${m(shift.countedCash ?? 0)}</td></tr>
        <tr style="font-weight:700"><td>${varianceLabel}</td><td class="r">${m(Math.abs(variance))}</td></tr>`
        }
      </table>
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
  const biz = sale.business?.name ?? 'Invoice';
  const showPan = !!(sale.business?.showTaxIdOnBill && sale.business?.taxId);
  const due = Math.max(0, Number(sale.total) - Number(sale.amountPaid));
  const cust = sale.customer;
  const rows = sale.items
    .map(
      (it, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(it.name)}</td>
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
        `<tr><td class="r muted" colspan="2">VAT ${t.rate}% (on ${m(t.taxable)})</td><td class="r">${m(t.tax)}</td></tr>`,
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
          ${taxLines || `<tr><td class="r muted" colspan="2">Tax</td><td class="r">${m(sale.tax)}</td></tr>`}
          <tr style="border-top:2px solid #111"><td class="r" colspan="2" style="font-weight:700;padding-top:6px">Total</td><td class="r" style="font-weight:700;padding-top:6px">${m(sale.total)}</td></tr>
          <tr><td class="r muted" colspan="2">Paid (${esc(sale.paymentMethod ?? 'CASH')})</td><td class="r">${m(sale.amountPaid)}</td></tr>
          ${due > 0 ? `<tr><td class="r" colspan="2" style="font-weight:700;color:#b00">Balance due</td><td class="r" style="font-weight:700;color:#b00">${m(due)}</td></tr>` : ''}
        </table>
      </div>
      <p class="muted" style="margin-top:24px;text-align:center">Thank you for your business.</p>
    </div>`;
  return shell(`Invoice ${sale.receiptNo}`, 'size: A4; margin: 16mm;', body);
}
