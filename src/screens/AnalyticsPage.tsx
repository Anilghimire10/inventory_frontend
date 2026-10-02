'use client';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { ReportsApi } from '@/api';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { PageHeader, LoadingBlock, ErrorState } from '@/components/ui/misc';
import { useStoreLabel } from '@/components/StorePicker';
import { useStoreScope } from '@/store/StoreContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { exportCsv } from '@/lib/csv';
import { TaxReportCard } from '@/components/analytics/TaxReportCard';
import { ShiftHistory } from '@/components/analytics/ShiftHistory';
import { AnalyticsBody } from '@/components/analytics/AnalyticsBody';

type RangeKey = 'today' | '7d' | '30d' | 'month' | 'all' | 'custom';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A `Date` as its own calendar date, `YYYY-MM-DD`.
 *
 * `toISOString().slice(0, 10)` is the UTC date, which for a till in Kathmandu
 * is yesterday's until 05:45 every morning -- so "Today" opened on the wrong
 * day for the first quarter of the trading day. The local getters are the
 * whole fix.
 */
function localDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return localDay(d);
}

function monthStart(): string {
  const d = new Date();
  return localDay(new Date(d.getFullYear(), d.getMonth(), 1));
}

const PRESETS: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
];

export default function AnalyticsPage() {
  const [range, setRange] = useState<RangeKey>('30d');
  const [customFrom, setCustomFrom] = useState(dayStr(7));
  const [customTo, setCustomTo] = useState(dayStr(0));
  // App-wide selection: switching in the header moves this page too.
  const { storeId } = useStoreScope();
  const storeLabel = useStoreLabel(storeId);

  const { from, to } = useMemo(() => {
    switch (range) {
      case 'today': return { from: dayStr(0), to: dayStr(0) };
      case '7d': return { from: dayStr(6), to: dayStr(0) };
      case '30d': return { from: dayStr(29), to: dayStr(0) };
      case 'month': return { from: monthStart(), to: dayStr(0) };
      case 'custom': return { from: customFrom, to: customTo };
      case 'all': default: return { from: undefined, to: undefined };
    }
  }, [range, customFrom, customTo]);

  // Calendar days: the API cuts them on the shop's own clock, the same one
  // its per-day and per-hour figures use, so the range and the buckets agree
  // even when the owner looks from a device in another time zone.
  const rangeParams = {
    fromDay: from,
    toDay: to,
    storeId: storeId || undefined,
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics', from, to, storeId],
    queryFn: () => ReportsApi.analytics(rangeParams),
  });

  // Keeps exports from the same range but different stores out of each
  // other's way in the downloads folder.
  const storeSuffix =
    storeLabel && storeLabel !== 'all stores'
      ? `_${storeLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
      : '';

  // One file per button: a click that saves two files at once gets the
  // second one blocked by most browsers.
  const { show } = useToast();
  const period = `${from ?? 'all'}_${to ?? 'all'}${storeSuffix}`;
  const save = (p: Promise<void>) => p.catch((e) => show(apiError(e), 'error'));
  const exportProducts = () =>
    data &&
    save(
      exportCsv(`sales-by-product_${period}`, [
        { key: 'name', label: 'Product' },
        { key: 'quantitySold', label: 'Units sold' },
        { key: 'revenue', label: 'Sales (excl. tax)' },
        { key: 'cost', label: 'Cost' },
        { key: 'profit', label: 'Profit' },
      ], [...data.byProduct].sort((a, b) => b.revenue - a.revenue)),
    );
  const exportCategories = () =>
    data &&
    save(
      exportCsv(`sales-by-category_${period}`, [
        { key: 'category', label: 'Category' },
        { key: 'units', label: 'Units sold' },
        { key: 'revenue', label: 'Sales (excl. tax)' },
        { key: 'share', label: 'Share %' },
      ], data.byCategory),
    );

  // Either custom date input can be cleared, which drops that bound from the
  // query -- so derive the label from the bounds themselves, not from `range`,
  // and it always describes what was actually asked for.
  const dateLabel = !from && !to
    ? 'all time'
    : from && to
      ? (from === to ? from : `${from} to ${to}`)
      : from
        ? `from ${from}`
        : `up to ${to}`;
  // Single-store businesses get no picker, so `storeLabel` is null and the
  // subtitles read exactly as they did before.
  const rangeLabel = storeLabel ? `${dateLabel}, ${storeLabel}` : dateLabel;

  const orderValue = data?.totals.transactions
    ? data.totals.grossSales / data.totals.transactions
    : 0;

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="How the shop is doing: what sold, what you kept as profit, where money leaked, and what needs doing."
      />

      {/* Range selector */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={range === p.key ? 'primary' : 'outline'}
            onClick={() => setRange(p.key)}
          >
            {p.label}
          </Button>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" className="h-8 w-auto" aria-label="Custom range start date" value={customFrom}
            onChange={(e) => { setCustomFrom(e.target.value); setRange('custom'); }} />
          <span className="text-sm text-muted-foreground">to</span>
          <Input type="date" className="h-8 w-auto" aria-label="Custom range end date" value={customTo}
            onChange={(e) => { setCustomTo(e.target.value); setRange('custom'); }} />
        </div>
        <div className="flex gap-2 sm:ml-auto">
          <Button size="sm" variant="outline" onClick={exportProducts} disabled={!data}>
            <Download className="h-4 w-4" /> Sales by product
          </Button>
          <Button size="sm" variant="outline" onClick={exportCategories} disabled={!data}>
            <Download className="h-4 w-4" /> Sales by category
          </Button>
        </div>
      </div>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <LoadingBlock />
      ) : (
        <AnalyticsBody data={data} orderValue={orderValue} />
      )}

      <Card className="mt-6">
        <TaxReportCard
          fromDay={rangeParams.fromDay}
          toDay={rangeParams.toDay}
          storeId={rangeParams.storeId}
          label={rangeLabel}
          fileSuffix={storeSuffix}
        />
      </Card>

      <Card className="mt-6">
        <ShiftHistory storeId={rangeParams.storeId} storeLabel={storeLabel} />
      </Card>
    </div>
  );
}
