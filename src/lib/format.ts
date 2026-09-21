/** Currency/date/number formatting helpers, locale-aware. */

let currentCurrency = 'USD';

export function setCurrency(code: string) {
  currentCurrency = code || 'USD';
}

// Building an Intl.NumberFormat is expensive relative to formatting a single
// number, and these run once per row in product grids, cart lines, and report
// tables — up to ~100/render. Cache one instance per currency code instead of
// constructing a fresh one on every call.
const moneyFormatters = new Map<string, Intl.NumberFormat>();
const symbolFormatters = new Map<string, Intl.NumberFormat>();
let numberFormatter: Intl.NumberFormat | null = null;

function getMoneyFormatter(currency: string): Intl.NumberFormat {
  let f = moneyFormatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat(undefined, { style: 'currency', currency });
    moneyFormatters.set(currency, f);
  }
  return f;
}

function getSymbolFormatter(currency: string): Intl.NumberFormat {
  let f = symbolFormatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    });
    symbolFormatters.set(currency, f);
  }
  return f;
}

export function formatMoney(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  try {
    return getMoneyFormatter(currentCurrency).format(n);
  } catch {
    return `${currentCurrency} ${n.toFixed(2)}`;
  }
}

export function currencySymbol(): string {
  try {
    const parts = getSymbolFormatter(currentCurrency).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? currentCurrency;
  } catch {
    return currentCurrency;
  }
}

export function formatNumber(value: number | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  numberFormatter ??= new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
  return numberFormatter.format(n);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
