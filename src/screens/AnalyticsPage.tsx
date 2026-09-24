'use client';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Banknote,
  TrendingUp,
  Receipt,
  ShoppingBag,
  Download,
  Boxes,
  AlertTriangle,
  PackageSearch,
  Users,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { ReportsApi, ShiftsApi } from '@/api';
import type { Analytics } from '@/types';
import { PageHeader, LoadingBlock, ErrorState } from '@/components/ui/misc';
import { useStoreLabel } from '@/components/StorePicker';
import { useStoreScope } from '@/store/StoreContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Hint } from '@/components/ui/tooltip';
import { formatMoney, formatNumber, formatDateTime, currencySymbol } from '@/lib/format';
import { exportCsv } from '@/lib/csv';
import { cn } from '@/lib/utils';

const PRIMARY = 'hsl(var(--primary))';
const PALETTE = [
  'hsl(var(--primary))',
  'hsl(var(--chart-1, 25 80% 50%))',
  'hsl(var(--chart-2, 142 70% 45%))',
  'hsl(var(--chart-3, 25 95% 53%))',
  'hsl(var(--chart-4, 262 80% 60%))',
  'hsl(var(--muted-foreground))',
];

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

/**
 * The instant a local day opens and closes, as the API wants them.
 *
 * The page used to send `${day}T00:00:00.000Z` -- UTC midnight, asked for as
 * though it were the shop's. The range was therefore shifted against the
 * buckets inside it: a "Today" report on a Nepali till began at 05:45 that
 * morning and ran to 05:45 the next. Constructing the `Date` from local parts
 * and letting `toISOString()` convert is what makes the bound mean local
 * midnight, whatever the offset.
 */
function startOfLocalDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}
function endOfLocalDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

const PRESETS: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
];

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  MOBILE: 'QR / Mobile',
  CREDIT: 'On credit',
  MIXED: 'Mixed',
};

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

  const rangeParams = {
    from: from ? startOfLocalDay(from) : undefined,
    to: to ? endOfLocalDay(to) : undefined,
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

  const exportAll = () => {
    if (!data) return;
    exportCsv(`analytics_${from ?? 'all'}_${to ?? 'all'}${storeSuffix}`, [
      { key: 'category', label: 'Category' },
      { key: 'revenue', label: 'Revenue' },
      { key: 'units', label: 'Units' },
      { key: 'share', label: 'Share %' },
    ], data.byCategory);
    exportCsv(`top-products_${from ?? 'all'}_${to ?? 'all'}${storeSuffix}`, [
      { key: 'name', label: 'Product' },
      { key: 'quantitySold', label: 'Qty sold' },
      { key: 'revenue', label: 'Revenue' },
      { key: 'cost', label: 'Cost' },
      { key: 'profit', label: 'Profit' },
    ], data.byProduct);
  };

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
        description="Understand sales, product and inventory performance."
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
        <Button size="sm" variant="outline" className="sm:ml-auto" onClick={exportAll}
          disabled={!data}>
          <Download className="h-4 w-4" /> Export
        </Button>
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
          from={rangeParams.from}
          to={rangeParams.to}
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

/**
 * VAT/tax collected over the selected range, split by rate — what a shop
 * copies onto its tax return. Zero-rated and exempt lines still count toward
 * the taxable base, so `byRate` (rates above 0 only) can total less than
 * `taxableAmount`; the summary row is the authority, not the sum of the table.
 */
function TaxReportCard({
  from,
  to,
  storeId,
  label,
  fileSuffix,
}: {
  from?: string;
  to?: string;
  storeId?: string;
  label: string;
  fileSuffix: string;
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['tax-report', from, to, storeId],
    queryFn: () => ReportsApi.taxReport({ from, to, storeId }),
  });

  // Lines taxed at 0% never reach `byRate`, so the table would otherwise not
  // add up to the taxable total shown above it.
  const untaxed = data
    ? Math.round(
        (data.taxableAmount - data.byRate.reduce((n, r) => n + r.taxableAmount, 0)) * 100,
      ) / 100
    : 0;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
        <div>
          <h2 className="font-semibold">Tax Report</h2>
          <p className="text-xs text-muted-foreground">
            Tax collected on completed sales, {label}. Returned items are excluded.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!data || data.byRate.length === 0}
          onClick={() =>
            data &&
            exportCsv(
              `tax-report_${from?.slice(0, 10) ?? 'all'}_${to?.slice(0, 10) ?? 'all'}${fileSuffix}`,
              [
                { key: 'rate', label: 'Rate %' },
                { key: 'taxableAmount', label: 'Taxable amount' },
                { key: 'tax', label: 'Tax' },
              ],
              data.byRate,
            )
          }
        >
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>

      {isError ? (
        <div className="p-5"><ErrorState onRetry={() => refetch()} /></div>
      ) : isLoading || !data ? (
        <div className="p-5"><LoadingBlock /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-3">
            <TaxFigure label="Taxable amount" value={data.taxableAmount} />
            <TaxFigure label="Tax collected" value={data.taxCollected} accent />
            <TaxFigure label="Gross sales" value={data.grossSales} />
          </div>

          {data.byRate.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No tax was charged in this period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Rate</th>
                    <th className="px-5 py-3 text-right font-medium">Taxable amount</th>
                    <th className="px-5 py-3 text-right font-medium">Tax</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byRate.map((r) => (
                    <tr key={r.rate} className="border-b border-border/60">
                      <td className="px-5 py-3 font-medium">{r.rate}%</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">
                        {formatMoney(r.taxableAmount)}
                      </td>
                      <td className="px-5 py-3 text-right font-medium">{formatMoney(r.tax)}</td>
                    </tr>
                  ))}
                  {untaxed > 0 && (
                    <tr className="border-b border-border/60">
                      <td className="px-5 py-3 text-muted-foreground">
                        Zero-rated / exempt
                      </td>
                      <td className="px-5 py-3 text-right text-muted-foreground">
                        {formatMoney(untaxed)}
                      </td>
                      <td className="px-5 py-3 text-right text-muted-foreground">—</td>
                    </tr>
                  )}
                  <tr className="bg-muted/40 font-medium">
                    <td className="px-5 py-3">Total</td>
                    <td className="px-5 py-3 text-right">{formatMoney(data.taxableAmount)}</td>
                    <td className="px-5 py-3 text-right">{formatMoney(data.taxCollected)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

function TaxFigure({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="bg-card p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-xl font-semibold', accent && 'text-primary')}>
        {formatMoney(value)}
      </p>
    </div>
  );
}

/** Cash-drawer sessions, for the whole business or one store — owner/manager only. */
function ShiftHistory({
  storeId,
  storeLabel,
}: {
  storeId?: string;
  storeLabel: string | null;
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['shift-history', storeId],
    queryFn: () => ShiftsApi.list({ limit: 20, storeId }),
  });
  const history = data?.data ?? [];
  return (
    <>
      <div className="border-b border-border p-5">
        <h2 className="font-semibold">Shift History</h2>
        <p className="text-xs text-muted-foreground">
          Cash-drawer sessions {storeLabel && storeLabel !== 'all stores'
            ? `at ${storeLabel}`
            : 'across the business'}, most recent first.
        </p>
      </div>
      {isError ? (
        <div className="p-5">
          <ErrorState onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <div className="p-5">
          <LoadingBlock />
        </div>
      ) : history.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {storeId ? 'No shifts at this store yet.' : 'No shifts closed yet.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-medium">Cashier</th>
                <th className="px-5 py-3 font-medium">Store</th>
                <th className="px-5 py-3 font-medium">Opened</th>
                <th className="px-5 py-3 font-medium">Closed</th>
                <th className="px-5 py-3 text-right font-medium">Sales</th>
                <th className="px-5 py-3 text-right font-medium"><Hint tip="What should be in the drawer: opening float + cash sales + credit collected in cash − cash refunds.">Expected</Hint></th>
                <th className="px-5 py-3 text-right font-medium">Counted</th>
                <th className="px-5 py-3 text-right font-medium"><Hint tip="Counted cash minus expected. Negative means the drawer is short.">Variance</Hint></th>
              </tr>
            </thead>
            <tbody>
              {history.map((s) => {
                const variance = s.variance == null ? null : Number(s.variance);
                return (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-3 font-medium">{s.user?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-muted-foreground">{s.store?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-muted-foreground">{formatDateTime(s.openedAt)}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {s.closedAt ? formatDateTime(s.closedAt) : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">{s._count?.sales ?? 0}</td>
                    <td className="px-5 py-3 text-right">{formatMoney(s.expectedCash)}</td>
                    <td className="px-5 py-3 text-right">{formatMoney(s.countedCash)}</td>
                    <td
                      className={cn(
                        'px-5 py-3 text-right font-medium',
                        variance == null || variance === 0
                          ? 'text-muted-foreground'
                          : variance > 0
                            ? 'text-success'
                            : 'text-destructive',
                      )}
                    >
                      {variance == null ? '—' : variance === 0 ? '—' : `${variance > 0 ? '+' : ''}${formatMoney(variance)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function AnalyticsBody({ data, orderValue }: { data: Analytics; orderValue: number }) {
  const cmp = data.comparison;
  const pct = (cur: number, prev: number | undefined) => {
    if (prev == null || prev <= 0) return null;
    return Math.round(((cur - prev) / prev) * 100 * 10) / 10;
  };
  const revDelta = pct(data.totals.grossSales, cmp?.revenue);
  const profitDelta = pct(data.totals.profit, cmp?.profit);
  const ordersDelta = pct(data.totals.transactions, cmp?.orders);
  const aovDelta = pct(orderValue, cmp?.revenue && cmp.orders ? cmp.revenue / cmp.orders : undefined);

  const chartData = data.byDay.map((d) => ({
    date: d.date.slice(5),
    revenue: d.total,
    orders: d.count,
    units: d.units,
  }));

  const hourlyData = data.hourly
    .filter((h) => h.count > 0 || h.total > 0)
    .map((h) => ({ ...h, label: h.hour === 12 ? '12 PM' : h.hour === 0 ? '12 AM' : `${h.hour % 12} ${h.hour < 12 ? 'AM' : 'PM'}` }));

  return (
    <>
      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Banknote} tone="primary" label="Revenue"
          value={formatMoney(data.totals.grossSales)} delta={revDelta} money />
        <KpiCard icon={TrendingUp} tone="primary" label="Gross Profit" hint="Revenue minus what the goods sold cost you."
          value={formatMoney(data.totals.profit)} delta={profitDelta} money />
        <KpiCard icon={Receipt} tone="primary" label="Orders"
          value={formatNumber(data.totals.transactions)} delta={ordersDelta} />
        <KpiCard icon={ShoppingBag} tone="primary" label="Avg. Order Value" hint="Revenue ÷ number of orders."
          value={formatMoney(orderValue)} delta={aovDelta} money />
      </div>

      {/* Sales performance + category donut */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SalesPerformance data={chartData} />
        </Card>
        <Card>
          <CategoryDonut data={data.byCategory} />
        </Card>
      </div>

      {/* Hourly + payment methods */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <HourlySales data={hourlyData} />
        </Card>
        <Card>
          <PaymentMethods data={data.byPaymentMethod} orders={data.totals.transactions} />
        </Card>
      </div>

      {/* Top products + inventory performance */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <TopProducts data={data.byProduct} />
        </Card>
        <Card>
          <InventoryPerformance data={data.inventory} />
        </Card>
      </div>

      {/* Who rang it up, and whether their drawer came out straight */}
      <Card className="mt-6">
        <StaffPerformance data={data.byStaff} unattributed={data.unattributed} />
      </Card>

      {/* Stock movement */}
      <Card className="mt-6">
        <StockMovement data={data.stockMovement} />
      </Card>

      {/* Needs attention */}
      <Card className="mt-6">
        <NeedsAttention data={data.needsAttention} />
      </Card>
    </>
  );
}

function KpiCard({
  icon: Icon, label, hint, value, delta, tone, money: isMoney,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; hint?: string; value: string; delta: number | null;
  tone: 'primary' | 'success' | 'default';
  money?: boolean;
}) {
  const toneClasses = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/15 text-success',
    default: 'bg-secondary text-secondary-foreground',
  }[tone];
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{hint ? <Hint tip={hint}>{label}</Hint> : label}</p>
          <p className={cn('mt-1 text-2xl font-semibold tracking-tight', isMoney && 'text-primary')}>
            {value}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5 text-xs">
            {delta != null && (
              <span className={cn(
                'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium',
                delta >= 0 ? 'bg-success/15 text-success' : 'bg-destructive/10 text-destructive',
              )}>
                {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}%
              </span>
            )}
            <span className="text-muted-foreground">vs prev. period</span>
          </div>
        </div>
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', toneClasses)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function SalesPerformance({ data }: { data: { date: string; revenue: number; orders: number; units: number }[] }) {
  const [metric, setMetric] = useState<'revenue' | 'orders' | 'units'>('revenue');
  const keyMap = { revenue: 'revenue', orders: 'orders', units: 'units' } as const;
  return (
    <>
      <div className="flex items-center gap-2 border-b border-border p-5">
        <h2 className="font-semibold">Sales Performance</h2>
        <div className="ml-auto flex gap-1">
          {(['revenue', 'orders', 'units'] as const).map((m) => (
            <button key={m}
              onClick={() => setMetric(m)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                metric === m ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="fillSales" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={PRIMARY} stopOpacity={0.4} />
                <stop offset="95%" stopColor={PRIMARY} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={48} />
            <Tooltip content={<ChartTooltip moneyKeys={metric === 'revenue' ? ['revenue'] : []} />} />
            <Area type="monotone" dataKey={keyMap[metric]} stroke={PRIMARY} strokeWidth={2}
              fill="url(#fillSales)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

function CategoryDonut({ data }: { data: Analytics['byCategory'] }) {
  const [active, setActive] = useState<number | null>(null);
  return (
    <>
      <div className="border-b border-border p-5"><h2 className="font-semibold">Sales by Category</h2></div>
      <div className="p-5">
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No sales in this period.</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={data} dataKey="revenue" nameKey="category" innerRadius={50} outerRadius={75}
                  paddingAngle={2} stroke="hsl(var(--background))"
                  onMouseEnter={(_, i) => setActive(i)} onMouseLeave={() => setActive(null)}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]}
                      opacity={active == null || active === i ? 1 : 0.35} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip moneyKeys={['revenue']} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              {data.map((c, i) => (
                <div key={c.category} className="flex items-center gap-2 text-sm"
                  onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
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

function HourlySales({ data }: { data: { hour: number; label: string; total: number; count: number; units: number }[] }) {
  return (
    <>
      <div className="flex items-center gap-2 border-b border-border p-5">
        <h2 className="font-semibold">Sales by hour of day</h2>
        <span className="ml-auto text-xs text-muted-foreground">Across the selected range</span>
      </div>
      <div className="p-4">
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No sales in this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={48} />
              <Tooltip content={<ChartTooltip moneyKeys={['total']} />} cursor={{ fill: 'hsl(var(--accent))' }} />
              <Bar dataKey="total" fill={PRIMARY} radius={[4, 4, 0, 0]} barSize={28} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </>
  );
}

function PaymentMethods({ data, orders }: { data: Analytics['byPaymentMethod']; orders: number }) {
  return (
    <>
      <div className="border-b border-border p-5"><h2 className="font-semibold">Payment Methods</h2></div>
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
                  {formatMoney(m.total)} · {m.count} sales
                </p>
              </div>
            ))}
            <p className="border-t border-border pt-3 text-xs text-muted-foreground">
              Total: {orders} orders
            </p>
          </>
        )}
      </div>
    </>
  );
}

type ProductSort = 'revenue' | 'gmroi';

function TopProducts({ data }: { data: Analytics['byProduct'] }) {
  const [sort, setSort] = useState<ProductSort>('revenue');

  const top = useMemo(() => {
    const rows = [...data];
    if (sort === 'revenue') rows.sort((a, b) => b.revenue - a.revenue);
    // Products with nothing left in stock have no GMROI -- there is no
    // investment to return on -- so they sort to the bottom rather than
    // ranking as zero, which would read as "earns nothing" instead of
    // "not measurable".
    else
      rows.sort((a, b) =>
        a.gmroi === null ? 1 : b.gmroi === null ? -1 : b.gmroi - a.gmroi,
      );
    return rows.slice(0, 5);
  }, [data, sort]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-5">
        <PackageSearch className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Top Selling Products</h2>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5">
            {(['revenue', 'gmroi'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSort(key)}
                aria-pressed={sort === key}
                className={cn(
                  'rounded px-2 py-1 text-xs font-medium transition-colors',
                  sort === key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {key === 'revenue' ? 'By revenue' : 'By GMROI'}
              </button>
            ))}
          </div>
          {data.length > 5 && (
            <Link href="/products" className="text-sm font-medium text-primary hover:underline">
              View all →
            </Link>
          )}
        </div>
      </div>
      {sort === 'gmroi' && (
        <p className="border-b border-border bg-muted/30 px-5 py-2 text-xs text-muted-foreground">
          Gross profit per {currencySymbol()}1 of stock held. Margin says what is
          profitable; this says what earns its shelf space — a low-margin item that
          sells daily beats a high-margin one that moves twice a month.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-medium">Product</th>
              <th className="px-5 py-3 text-right font-medium">Units</th>
              <th className="px-5 py-3 text-right font-medium">Revenue</th>
              <th className="px-5 py-3 text-right font-medium">
                <Hint tip="Gross margin return on inventory: gross profit ÷ stock value at cost. 3.0 means every rupee of stock earned three in profit. Higher means the product earns its shelf space.">
                  GMROI
                </Hint>
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
                <td className="px-5 py-3 text-right">{p.quantitySold}</td>
                <td className="px-5 py-3 text-right font-medium">{formatMoney(p.revenue)}</td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {p.gmroi === null ? (
                    <span className="text-muted-foreground" title="Nothing left in stock, so there is no inventory to measure a return against">
                      —
                    </span>
                  ) : (
                    `${p.gmroi.toFixed(2)}x`
                  )}
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
function StaffPerformance({
  data,
  unattributed,
}: {
  data: Analytics['byStaff'];
  unattributed: Analytics['unattributed'];
}) {
  return (
    <>
      <div className="flex items-center gap-2 border-b border-border p-5">
        <Users className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Staff Performance</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-medium">Cashier</th>
              <th className="px-5 py-3 text-right font-medium">Sales</th>
              <th className="px-5 py-3 text-right font-medium">Revenue</th>
              <th className="px-5 py-3 text-right font-medium">Avg. basket</th>
              <th className="px-5 py-3 text-right font-medium">Shifts</th>
              <th className="px-5 py-3 text-right font-medium">Drawer variance</th>
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

function InventoryPerformance({ data }: { data: Analytics['inventory'] }) {
  const rows: { label: string; hint?: string; value: string; sub: string }[] = [
    {
      label: 'Stock Turnover',
      hint: 'How many times the stock sold through in this period: cost of goods sold ÷ inventory value. Higher means stock moves faster.',
      value: `${data.stockTurnover}x`,
      sub: 'COGS ÷ inventory value',
    },
    {
      label: 'Sell-through',
      hint: 'Units sold as a share of units available to sell: sold ÷ (sold + still on hand).',
      value: `${data.sellThrough}%`,
      sub: 'units sold vs. on hand',
    },
    {
      label: 'Dead Stock',
      hint: "Stock that hasn't sold at all in the last 30 days, as a share of inventory value.",
      value: `${data.deadStockPct}%`,
      sub: formatMoney(data.deadStockValue),
    },
    { label: 'Inventory Value', value: formatMoney(data.value), sub: 'at cost' },
  ];
  return (
    <>
      <div className="flex items-center gap-2 border-b border-border p-5">
        <Boxes className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Inventory Performance</h2>
      </div>
      <div className="space-y-4 p-5">
        {rows.map((r) => (
          <div key={r.label}>
            <p className="text-sm text-muted-foreground">
              {r.hint ? <Hint tip={r.hint}>{r.label}</Hint> : r.label}
            </p>
            <p className="mt-0.5 text-xl font-semibold">{r.value}</p>
            <p className="text-xs text-muted-foreground">{r.sub}</p>
          </div>
        ))}
      </div>
    </>
  );
}

function StockMovement({ data }: { data: Analytics['stockMovement'] }) {
  const chartData = useMemo(
    () => data.map((d) => ({ ...d, date: d.date.slice(5) })),
    [data],
  );
  return (
    <>
      <div className="border-b border-border p-5">
        <h2 className="font-semibold">Stock Movement</h2>
        <p className="text-xs text-muted-foreground">Purchases vs. sales vs. adjustments, with running closing stock.</p>
      </div>
      <div className="p-4">
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No stock movements in this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}
              margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={48} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="purchases" name="Purchases" stroke={PRIMARY} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="sales" name="Sales" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="adjustments" name="Adjustments" stroke="hsl(var(--chart-2, 142 70% 45%))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="closing" name="Closing Stock" stroke="hsl(var(--chart-3, 25 95% 53%))" strokeWidth={2} strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </>
  );
}

function NeedsAttention({ data }: { data: Analytics['needsAttention'] }) {
  const items: { label: string; count: number; href: string; cta: string }[] = [
    { label: 'products below minimum stock', count: data.lowStock, href: '/inventory', cta: 'View Stock' },
    { label: "products haven't sold in 30 days", count: data.unsold, href: '/products', cta: 'View Products' },
    { label: 'products expiring within 30 days', count: data.expiring, href: '/inventory', cta: 'View Expiry' },
  ];
  return (
    <>
      <div className="flex items-center gap-2 border-b border-border p-5">
        <AlertTriangle className="h-5 w-5 text-warning" />
        <h2 className="font-semibold">Needs Attention</h2>
      </div>
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

function ChartTooltip({
  active,
  payload,
  label,
  moneyKeys = [],
}: {
  active?: boolean;
  payload?: { name: string; value: number; dataKey: string }[];
  label?: string;
  moneyKeys?: string[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      {label && <div className="mb-1 font-medium">{label}</div>}
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="capitalize text-muted-foreground">{p.name}:</span>
          <span className="font-medium">
            {moneyKeys.includes(p.dataKey) ? formatMoney(p.value) : formatNumber(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}