'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { Boxes, AlertTriangle, PackageSearch, Users, Store as StoreIcon } from 'lucide-react';
import type { Analytics } from '@/types';
import { Hint } from '@/components/ui/tooltip';
import { formatMoney, formatNumber, plural } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SectionHeader } from './parts';

/** Each branch side by side, for a shop with more than one. */
export function StoreComparison({ data }: { data: Analytics['byStore'] }) {
  return (
    <>
      <SectionHeader icon={StoreIcon} title="Branches compared"
        description="How each branch did in this period. A branch with good sales but a low margin may be discounting or selling mostly low-margin goods. Pick a branch at the top of the app to see its full detail." />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-medium">Branch</th>
              <th className="px-5 py-3 text-right font-medium">Sales</th>
              <th className="px-5 py-3 font-medium">Share</th>
              <th className="px-5 py-3 text-right font-medium">Gross profit</th>
              <th className="px-5 py-3 text-right font-medium">Margin</th>
              <th className="px-5 py-3 text-right font-medium">Bills</th>
              <th className="px-5 py-3 text-right font-medium">Avg. bill</th>
            </tr>
          </thead>
          <tbody>
            {data.map((b) => (
              <tr key={b.storeId} className="border-b border-border/60 last:border-0">
                <td className="px-5 py-3 font-medium">{b.name}</td>
                <td className="px-5 py-3 text-right font-medium">{formatMoney(b.sales)}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${b.share}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground">{b.share}%</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-right">{formatMoney(b.profit)}</td>
                <td className="px-5 py-3 text-right">{b.margin}%</td>
                <td className="px-5 py-3 text-right">{formatNumber(b.orders)}</td>
                <td className="px-5 py-3 text-right">{formatMoney(b.averageBill)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function TopProducts({ data }: { data: Analytics['byProduct'] }) {
  const top = useMemo(() => [...data].sort((a, b) => b.revenue - a.revenue).slice(0, 5), [data]);

  return (
    <>
      <SectionHeader icon={PackageSearch} title="Best products"
        description="Your five biggest sellers in this period, and the profit each one made. Keep these in stock.">
        {data.length > 5 && (
          <Link href="/products" className="text-sm font-medium text-primary hover:underline">
            View all →
          </Link>
        )}
      </SectionHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-medium">Product</th>
              <th className="px-5 py-3 text-right font-medium">Units</th>
              <th className="px-5 py-3 text-right font-medium">
                <Hint tip="What these units sold for, without tax.">Sales</Hint>
              </th>
              <th className="px-5 py-3 text-right font-medium">
                <Hint tip="Sales minus what the units cost you to buy.">Profit</Hint>
              </th>
            </tr>
          </thead>
          <tbody>
            {top.length === 0 && (
              <tr><td className="px-5 py-8 text-center text-muted-foreground" colSpan={4}>No sales in this period.</td></tr>
            )}
            {top.map((p, i) => (
              <tr key={p.productId} className="border-b border-border/60 last:border-0">
                <td className="flex items-center gap-3 px-5 py-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="font-medium">{p.name}</span>
                </td>
                <td className="px-5 py-3 text-right">{formatNumber(p.quantitySold)}</td>
                <td className="px-5 py-3 text-right font-medium">{formatMoney(p.revenue)}</td>
                <td className={cn('px-5 py-3 text-right', p.profit < 0 ? 'text-destructive' : 'text-success')}>
                  {formatMoney(p.profit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * Sales and drawer accuracy per cashier.
 *
 * Every sale already recorded who rang it and which shift it belonged to;
 * nothing read either. Drawer variance by person is the number shift
 * reconciliation exists to surface, so it is the one the table sorts to the
 * eye: negative means the till came up short.
 */
export function StaffPerformance({
  data,
  unattributed,
}: {
  data: Analytics['byStaff'];
  unattributed: Analytics['unattributed'];
}) {
  return (
    <>
      <SectionHeader icon={Users} title="Staff"
        description="Sales rung up by each person, and whether their cash drawer matched at closing. A negative drawer figure means cash was short — check those shifts in Shift history below." />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-medium">Staff</th>
              <th className="px-5 py-3 text-right font-medium">Bills</th>
              <th className="px-5 py-3 text-right font-medium">Sales</th>
              <th className="px-5 py-3 text-right font-medium">Avg. bill</th>
              <th className="px-5 py-3 text-right font-medium">Shifts closed</th>
              <th className="px-5 py-3 text-right font-medium">
                <Hint tip="Counted cash minus what the drawer should have held, added up over their closed shifts. Negative: short. Positive: over. Hover a figure for their worst single count.">
                  Drawer +/−
                </Hint>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr><td className="px-5 py-8 text-center text-muted-foreground" colSpan={6}>No staff activity in this period.</td></tr>
            )}
            {data.map((s) => (
              <tr key={s.userId} className="border-b border-border/60 last:border-0">
                <td className="px-5 py-3 font-medium">{s.name}</td>
                <td className="px-5 py-3 text-right">{formatNumber(s.transactions)}</td>
                <td className="px-5 py-3 text-right font-medium">{formatMoney(s.revenue)}</td>
                <td className="px-5 py-3 text-right">{formatMoney(s.averageBasket)}</td>
                <td className="px-5 py-3 text-right">{s.shifts || '—'}</td>
                <td
                  className={cn(
                    'px-5 py-3 text-right tabular-nums',
                    s.totalVariance === null
                      ? 'text-muted-foreground'
                      : s.totalVariance < 0
                        ? 'text-destructive'
                        : s.totalVariance > 0
                          ? 'text-warning'
                          : 'text-muted-foreground',
                  )}
                  title={
                    s.worstVariance === null
                      ? 'No shifts closed in this period'
                      : `Worst single count: ${formatMoney(s.worstVariance)}`
                  }
                >
                  {s.totalVariance === null ? '—' : formatMoney(s.totalVariance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {unattributed && (
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          {formatMoney(unattributed.revenue)} over {formatNumber(unattributed.transactions)} sale
          {unattributed.transactions === 1 ? '' : 's'} has no cashier recorded against it —
          rung up before staff attribution existed, or by a user since removed. It is
          excluded from the rows above but included in the period total.
        </p>
      )}
    </>
  );
}

export function InventoryPerformance({ data }: { data: Analytics['inventory'] }) {
  const cover = data.daysOfCover;
  const coverNote =
    cover == null
      ? 'Nothing sold in this period, so there is no pace to measure.'
      : cover < 7
        ? 'Running low: reorder your fast sellers now.'
        : cover > 90
          ? 'More than three months of stock: money is sitting on the shelf.'
          : 'A healthy amount of stock for your pace of sales.';
  const rows: { label: string; hint: string; value: string; sub: string; warn?: boolean }[] = [
    {
      label: 'Days of stock left',
      hint: 'How long the stock you hold would last if you keep selling at this period’s pace: stock value at cost ÷ cost of goods sold per day. Under a week is tight; over three months is a lot of cash tied up.',
      value: cover == null ? '—' : plural(cover, 'day'),
      sub: coverNote,
      warn: cover != null && (cover < 7 || cover > 90),
    },
    {
      label: 'Stock value',
      hint: 'What everything on the shelf cost you to buy, right now.',
      value: formatMoney(data.value),
      sub: 'At cost, as of now',
    },
    {
      label: 'Dead stock',
      hint: 'Stock that hasn’t sold at all in the last 30 days, and its share of your stock value. Consider a discount, a bundle, or returning it to the supplier.',
      value: formatMoney(data.deadStockValue),
      sub: `${data.deadStockPct}% of stock value has not sold in 30 days`,
      warn: data.deadStockPct >= 25,
    },
  ];
  return (
    <>
      <SectionHeader icon={Boxes} title="Stock health"
        description="Whether you hold the right amount of stock: too little loses sales, too much ties up cash." />
      <div className="space-y-4 p-5">
        {rows.map((r) => (
          <div key={r.label}>
            <p className="text-sm text-muted-foreground"><Hint tip={r.hint}>{r.label}</Hint></p>
            <p className={cn('mt-0.5 text-xl font-semibold', r.warn && 'text-warning')}>{r.value}</p>
            <p className="text-xs text-muted-foreground">{r.sub}</p>
          </div>
        ))}
      </div>
    </>
  );
}

export function NeedsAttention({ data }: { data: Analytics['needsAttention'] }) {
  const items: { label: string; count: number; href: string; cta: string }[] = [
    { label: 'products below minimum stock', count: data.lowStock, href: '/inventory?tab=low', cta: 'View Stock' },
    { label: "products haven't sold in 30 days", count: data.unsold, href: '/products', cta: 'View Products' },
    { label: 'products expiring within 30 days', count: data.expiring, href: '/inventory?tab=expiring', cta: 'View Expiry' },
  ];
  return (
    <>
      <SectionHeader icon={AlertTriangle} title="Needs attention"
        description="Quick jobs that protect sales and cash. These are as of now, not for the period picked." />
      <div className="divide-y divide-border">
        {items.map((it) => (
          <div key={it.label} className="flex items-center gap-3 px-5 py-3.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-warning/15 text-warning">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-semibold">{it.count}</span> {it.label}
              </p>
            </div>
            <Link href={it.href} className="shrink-0 text-sm font-medium text-primary hover:underline">
              {it.cta} →
            </Link>
          </div>
        ))}
      </div>
    </>
  );
}
