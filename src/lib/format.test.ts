import { afterEach, describe, expect, it } from 'vitest';
import { currencySymbol, formatDate, formatMoney, formatTimeAgo, setCurrency } from './format';

// Intl output varies with the host's locale, so assert on behaviour that must
// hold anywhere rather than on exact strings.
afterEach(() => setCurrency('USD'));

describe('formatMoney', () => {
  it('formats a decimal string exactly like the same number', () => {
    // Totals arrive as Decimal strings; the two must not diverge.
    expect(formatMoney('1234.5')).toBe(formatMoney(1234.5));
    expect(formatMoney('0')).toBe(formatMoney(0));
  });

  it('reads nothing as zero', () => {
    expect(formatMoney(null)).toBe(formatMoney(0));
    expect(formatMoney(undefined)).toBe(formatMoney(0));
  });

  it('follows the configured currency', () => {
    setCurrency('NPR');
    const npr = formatMoney(10);
    setCurrency('EUR');
    expect(formatMoney(10)).not.toBe(npr);
  });

  it('falls back to a plain code and amount for an invalid currency', () => {
    // A business configured with a junk code must still render a figure
    // rather than throwing the whole screen away.
    setCurrency('not-a-currency');
    expect(formatMoney(10)).toBe('not-a-currency 10.00');
  });

  it('treats an empty currency code as USD', () => {
    setCurrency('USD');
    const usd = formatMoney(1);
    setCurrency('');
    expect(formatMoney(1)).toBe(usd);
  });
});

describe('currencySymbol', () => {
  it('returns something non-empty for a real currency', () => {
    setCurrency('NPR');
    expect(currencySymbol()).not.toBe('');
  });

  it('falls back to the raw code when Intl rejects it', () => {
    setCurrency('not-a-currency');
    expect(currencySymbol()).toBe('not-a-currency');
  });
});

describe('formatDate', () => {
  it('shows a dash for a missing date instead of "Invalid Date"', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
  });
});

describe('formatTimeAgo', () => {
  const now = new Date('2026-09-30T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const MIN = 60_000;

  it('reads recent times as minutes and hours', () => {
    expect(formatTimeAgo(ago(20_000), now)).toBe('Just now');
    expect(formatTimeAgo(ago(5 * MIN), now)).toBe('5m ago');
    expect(formatTimeAgo(ago(3 * 60 * MIN), now)).toBe('3h ago');
  });

  it('reads older times as days, then the date', () => {
    expect(formatTimeAgo(ago(30 * 60 * MIN), now)).toBe('Yesterday');
    expect(formatTimeAgo(ago(4 * 24 * 60 * MIN), now)).toBe('4d ago');
    expect(formatTimeAgo(ago(10 * 24 * 60 * MIN), now)).toBe(formatDate(ago(10 * 24 * 60 * MIN)));
  });

  it('shows a dash for nothing', () => {
    expect(formatTimeAgo(null)).toBe('—');
  });
});
