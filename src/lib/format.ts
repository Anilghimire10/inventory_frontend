/** Currency/date/number formatting helpers, locale-aware. */

let currentCurrency = 'USD';

export function setCurrency(code: string) {
  currentCurrency = code || 'USD';
}

export function formatMoney(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currentCurrency,
    }).format(n);
  } catch {
    return `${currentCurrency} ${n.toFixed(2)}`;
  }
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
