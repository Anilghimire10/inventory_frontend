'use client';
import { useState } from 'react';
import type { Analytics } from '@/types';
import { formatMoney, plural } from '@/lib/format';
import { BarsChart, DonutChart, TrendChart } from '@/components/charts';
import { cn } from '@/lib/utils';
import { SectionHeader } from './parts';

// Fixed order, never cycled: past eight, slices fold into "Other".
const PALETTE = Array.from({ length: 8 }, (_, i) => `hsl(var(--chart-${i + 1}))`);

const OTHER_COLOR = 'hsl(var(--muted-foreground))';

/** Biggest categories first (the API sorts them); the tail past what the palette can tell apart becomes "Other". */
function foldCategories(rows: Analytics['byCategory']): Analytics['byCategory'] {
  if (rows.length <= PALETTE.length) return rows;
  const head = rows.slice(0, PALETTE.length - 1);
  const tail = rows.slice(PALETTE.length - 1);
  const sum = (k: 'revenue' | 'units' | 'share') => Math.round(tail.reduce((s, r) => s + r[k], 0) * 100) / 100;
  return [...head, { category: `Other (${tail.length})`, revenue: sum('revenue'), units: sum('units'), share: sum('share') }];
}

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  MOBILE: 'QR / Mobile',
  KHALTI: 'Khalti',
  CONNECTIPS: 'connectIPS',
  CREDIT: 'On credit',
  MIXED: 'Mixed',
};

export const HOUR_LABEL = (h: number) => (h === 0 ? '12 AM' : h === 12 ? '12 PM' : `${h % 12} ${h < 12 ? 'AM' : 'PM'}`);

export function SalesPerformance({ data }: { data: { date: string; revenue: number; orders: number; units: number }[] }) {
  const [metric, setMetric] = useState<'revenue' | 'orders' | 'units'>('revenue');
  return (
    <>
      <SectionHeader title="Sales trend"
        description="Day by day for the period. Look for your slow days (a good time for an offer) and your busy ones (have enough staff and stock).">
        <div className="flex gap-1">
          {(['revenue', 'orders', 'units'] as const).map((m) => (
            <button key={m}
              onClick={() => setMetric(m)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                metric === m ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {m === 'revenue' ? 'sales' : m === 'orders' ? 'bills' : 'units'}
            </button>
          ))}
        </div>
      </SectionHeader>
      <div className="p-4">
        <TrendChart data={data} xKey="date" yKey={metric}
          name={metric === 'revenue' ? 'sales' : metric === 'orders' ? 'bills' : 'units'}
          money={metric === 'revenue'} height={260} />
      </div>
    </>
  );
}

export function CategoryDonut({ data }: { data: Analytics['byCategory'] }) {
  const [active, setActive] = useState<number | null>(null);
  const rows = foldCategories(data);
  const color = (i: number) => (rows !== data && i === rows.length - 1 ? OTHER_COLOR : PALETTE[i]);
  return (
    <>
      <SectionHeader title="Sales by category"
        description="Which kinds of goods your net sales come from. A big slice is a category you depend on: never let it run out." />
      <div className="p-5">
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No sales in this period.</p>
        ) : (
          <>
            <DonutChart data={rows.map((r) => ({ name: r.category, value: r.revenue }))}
              colors={rows.map((_, i) => color(i))} active={active} onActive={setActive} money height={180} />
            <div className="mt-4 space-y-2">
              {rows.map((c, i) => (
                <div key={c.category} className="flex items-center gap-2 text-sm"
                  onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color(i) }} />
                  <span className="flex-1 truncate">{c.category}</span>
                  <span className="font-medium">{c.share}%</span>
                  <span className="text-xs text-muted-foreground">{formatMoney(c.revenue)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export function HourlySales({ data }: { data: { hour: number; label: string; total: number; count: number; units: number }[] }) {
  return (
    <>
      <SectionHeader title="Busy hours"
        description="Sales by hour of the day, all days in the period added together. Put more staff on at the peak; restock and clean in the quiet hours." />
      <div className="p-4">
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No sales in this period.</p>
        ) : (
          <BarsChart data={data} xKey="label" yKey="total" name="sales" money height={240} barSize={28} />
        )}
      </div>
    </>
  );
}

export function PaymentMethods({ data, orders }: { data: Analytics['byPaymentMethod']; orders: number }) {
  return (
    <>
      <SectionHeader title="How customers pay"
        description="A big 'On credit' share is money you still have to collect: follow it up on the Credit page." />
      <div className="space-y-4 p-5">
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No data.</p>
        ) : (
          <>
            {data.map((m) => (
              <div key={m.method}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span>{METHOD_LABEL[m.method] ?? m.method}</span>
                  <span className="font-medium">{m.share}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${m.share}%` }} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatMoney(m.total)} · {plural(m.count, 'bill')}
                </p>
              </div>
            ))}
            <p className="border-t border-border pt-3 text-xs text-muted-foreground">
              Total: {plural(orders, 'bill')}
            </p>
          </>
        )}
      </div>
    </>
  );
}
