'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  Wallet,
  Store as StoreIcon,
  TicketPercent,
  Undo2,
  PackageX,
  HandCoins,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { ReportsApi, ShiftsApi, type CloseShiftBody } from '@/api';
import type { Analytics, ShiftReport } from '@/types';
import { useAuth } from '@/auth/AuthContext';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { isStaleShift } from '@/lib/cash';
import { printShiftReport } from '@/lib/print';
import { CloseShiftModal } from '@/components/pos/CloseShiftModal';
import { PageHeader, LoadingBlock, ErrorState } from '@/components/ui/misc';
import { useStoreLabel } from '@/components/StorePicker';
import { useStoreScope } from '@/store/StoreContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Hint } from '@/components/ui/tooltip';
import { formatMoney, formatNumber, formatDateTime } from '@/lib/format';
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

/**
 * VAT/tax collected over the selected range, split by rate — what a shop
 * copies onto its tax return. Zero-rated and exempt lines still count toward
 * the taxable base, so `byRate` (rates above 0 only) can total less than
 * `taxableAmount`; the summary row is the authority, not the sum of the table.
 */
function TaxReportCard({
  fromDay,
  toDay,
  storeId,
  label,
  fileSuffix,
}: {
  fromDay?: string;
  toDay?: string;
  storeId?: string;
  label: string;
  fileSuffix: string;
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['tax-report', fromDay, toDay, storeId],
    queryFn: () => ReportsApi.taxReport({ fromDay, toDay, storeId }),
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
              `tax-report_${fromDay ?? 'all'}_${toDay ?? 'all'}${fileSuffix}`,
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
  const qc = useQueryClient();
  const { user } = useAuth();
  const { show } = useToast();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['shift-history', storeId],
    queryFn: () => ShiftsApi.list({ limit: 20, storeId }),
  });
  const history = data?.data ?? [];

  // Closing a till from here: the one a cashier forgot, found the next
  // morning. It still has to be counted -- the drawer is at the counter, and
  // this is the same count the POS asks for.
  const [closing, setClosing] = useState<ShiftReport | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const startClose = async (id: string) => {
    setLoadingId(id);
    try {
      const report = await ShiftsApi.report(id);
      if (report.isOpen) setClosing(report);
      else {
        show('That shift was already closed.', 'info');
        void refetch();
      }
    } catch (e) {
      show(apiError(e), 'error');
    } finally {
      setLoadingId(null);
    }
  };
  const closeMutation = useMutation({
    mutationFn: ({ id, ...body }: CloseShiftBody & { id: string }) => ShiftsApi.close(id, body),
    onSuccess: (closed) => {
      setClosing(null);
      qc.invalidateQueries({ queryKey: ['shift-history'] });
      // The POS on this device may be showing that till as open.
      qc.invalidateQueries({ queryKey: ['shift-current'] });
      qc.invalidateQueries({ queryKey: ['shift-open'] });
      qc.invalidateQueries({ queryKey: ['shift-float'] });
      printShiftReport(closed, {
        businessName: user?.business?.name ?? 'Shift report',
        currency: user?.business?.currency ?? 'USD',
      });
      show(closed.user?.name ? `Closed ${closed.user.name}’s shift` : 'Shift closed');
    },
    onError: (e) => show(apiError(e), 'error'),
  });
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
                <th className="px-5 py-3 font-medium"><span className="sr-only">Actions</span></th>
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
                      {s.closedAt ? (
                        formatDateTime(s.closedAt)
                      ) : (
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            isStaleShift(s.openedAt)
                              ? 'bg-warning/15 text-warning'
                              : 'bg-success/15 text-success',
                          )}
                          title={
                            isStaleShift(s.openedAt)
                              ? 'Open for over a day. Its count will mix days of cash together.'
                              : undefined
                          }
                        >
                          {isStaleShift(s.openedAt) ? 'Still open' : 'Open'}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">{s._count?.sales ?? 0}</td>
                    {/* Nothing is expected or counted until the drawer is
                        closed; formatMoney would print a null as 0.00, which
                        reads as an empty till rather than an open one. */}
                    <td className="px-5 py-3 text-right">
                      {s.expectedCash == null ? '—' : formatMoney(s.expectedCash)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {s.countedCash == null ? '—' : formatMoney(s.countedCash)}
                    </td>
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
                    <td className="px-5 py-3 text-right">
                      {!s.closedAt && (
                        <Button
                          size="sm"
                          variant="outline"
                          loading={loadingId === s.id}
                          onClick={() => startClose(s.id)}
                        >
                          Close
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {closing && (
        <CloseShiftModal
          shift={closing}
          currency={user?.business?.currency}
          onClose={() => setClosing(null)}
          onConfirm={(body) => closeMutation.mutate({ id: closing.id, ...body })}
          isPending={closeMutation.isPending}
        />
      )}
    </>
  );
}

const REASON_LABEL: Record<string, string> = {
  DAMAGE: 'Damaged',
  EXPIRED: 'Expired',
  THEFT: 'Stolen or lost',
  COUNT_CORRECTION: 'Missing at a count',
  OTHER: 'Other',
};

const HOUR_LABEL = (h: number) => (h === 0 ? '12 AM' : h === 12 ? '12 PM' : `${h % 12} ${h < 12 ? 'AM' : 'PM'}`);

function AnalyticsBody({ data, orderValue }: { data: Analytics; orderValue: number }) {
  const t = data.totals;
  const m = data.money;

  const chartData = data.byDay.map((d) => ({
    date: d.date.slice(5),
    revenue: d.total,
    orders: d.count,
    units: d.units,
  }));

  const hourlyData = data.hourly
    .filter((h) => h.count > 0 || h.total > 0)
    .map((h) => ({ ...h, label: HOUR_LABEL(h.hour) }));

  return (
    <>
      {/* KPI cards: what came in, what you kept */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard icon={Banknote} label="Sales (incl. tax)"
          hint="Everything customers paid on their bills in this period, after discounts and less refunds. It includes the tax you collected, which isn't yours to keep."
          value={formatMoney(t.grossSales)}
          sub={t.tax > 0 ? `Includes ${formatMoney(t.tax)} tax collected` : 'No tax charged'} />
        <KpiCard icon={TrendingUp} label="Gross profit"
          hint="What you sold the goods for (without tax) minus what they cost you to buy. Margin is how much of every sale is profit."
          value={formatMoney(t.profit)}
          sub={`${t.margin}% margin`} />
        <KpiCard icon={Wallet} label="Net profit"
          hint="Gross profit, less expenses paid from the till and the cost of stock written off (damaged, expired, stolen or missing). What the shop actually made. Rent, salaries and bills paid outside the till aren't included."
          value={formatMoney(t.netProfit)}
          sub={
            m.expenses.total > 0 || m.writeOffs.value > 0
              ? `After ${formatMoney(m.expenses.total)} expenses and ${formatMoney(m.writeOffs.value)} write-offs`
              : 'No expenses or write-offs recorded'
          } />
        <KpiCard icon={Receipt} label="Bills"
          hint="How many sales were rung up. Held carts don't count until they're completed."
          value={formatNumber(t.transactions)}
          sub={`${formatNumber(t.units)} items sold`} />
        <KpiCard icon={ShoppingBag} label="Average bill"
          hint="Sales ÷ bills. Suggesting an add-on or a bundle at the counter is the usual way to raise it."
          value={formatMoney(orderValue)}
          sub="Per customer visit" />
      </div>

      {/* Branches */}
      {data.byStore.length > 1 && (
        <Card className="mt-6">
          <StoreComparison data={data.byStore} />
        </Card>
      )}

      {/* Sales performance + category donut */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SalesPerformance data={chartData} />
        </Card>
        <Card>
          <CategoryDonut data={data.byCategory} />
        </Card>
      </div>

      {/* Where money leaks */}
      <Card className="mt-6">
        <MoneyLeaks data={m} grossSales={t.grossSales} />
      </Card>

      {/* Hourly + payment methods */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <HourlySales data={hourlyData} />
        </Card>
        <Card>
          <PaymentMethods data={data.byPaymentMethod} orders={t.transactions} />
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

      {/* Needs attention */}
      <Card className="mt-6">
        <NeedsAttention data={data.needsAttention} />
      </Card>
    </>
  );
}

/**
 * A section's title, a plain sentence on what it shows and what to do about
 * it, and optional controls on the right.
 */
function SectionHeader({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-border p-5">
      <div className="min-w-0 flex-1 basis-64">
        <h2 className="flex items-center gap-2 font-semibold">
          {Icon && <Icon className="h-5 w-5 text-primary" />}
          {title}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

function KpiCard({
  icon: Icon, label, hint, value, sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  /** What the figure means, in plain words: shown on hover of the label. */
  hint: string;
  value: string;
  /** A line of context under the figure. */
  sub?: string;
}) {
  return (
    <Card className="p-5">
      {/* Icon on the title row, so a long amount has the card's full width. */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground"><Hint tip={hint}>{label}</Hint></p>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-primary xl:text-xl 2xl:text-2xl">
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

/**
 * Money that left without becoming profit: discounts, refunds, stock written
 * off, and till expenses -- plus who gave the discounts, which is where a
 * problem usually shows first.
 */
function MoneyLeaks({ data, grossSales }: { data: Analytics['money']; grossSales: number }) {
  const avgPct = data.discounts.pct;
  const tiles: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    hint: string;
    value: string;
    sub: string;
  }[] = [
    {
      icon: TicketPercent,
      label: 'Discounts given',
      hint: 'Line and bill discounts taken off at the till. Already out of your sales figure.',
      value: formatMoney(data.discounts.total),
      sub: `${data.discounts.pct}% off · on ${formatNumber(data.discounts.salesWithDiscount)} bills`,
    },
    {
      icon: Undo2,
      label: 'Refunds paid',
      hint: 'Cash handed back to customers on returns in this period. Returns on credit sales cancel what the customer owed instead, so they aren’t counted here.',
      value: formatMoney(data.refunds.total),
      sub: `${formatNumber(data.refunds.count)} refunds · ${formatNumber(data.refunds.unitsReturned)} units back · ${data.refunds.returnRate}% of bills`,
    },
    {
      icon: PackageX,
      label: 'Stock written off',
      hint: 'Stock removed by hand as damaged, expired, stolen or missing at a count, valued at today’s cost price. It is taken off net profit.',
      value: formatMoney(data.writeOffs.value),
      sub: `${formatNumber(data.writeOffs.units)} units`,
    },
    {
      icon: HandCoins,
      label: 'Expenses from the till',
      hint: 'Cash paid out of the drawer as an expense (Cash in/out → Expense). Taken off net profit. Owner drawings aren’t a cost, so they are shown separately.',
      value: formatMoney(data.expenses.total),
      sub:
        `${formatNumber(data.expenses.count)} payouts` +
        (data.ownerDrawings > 0 ? ` · owner took ${formatMoney(data.ownerDrawings)}` : ''),
    },
  ];
  const leaked = data.discounts.total + data.refunds.total + data.writeOffs.value + data.expenses.total;

  return (
    <>
      <SectionHeader icon={AlertTriangle} title="Where money leaks"
        description="Money that left without becoming profit. Some is normal; look into anything that jumps from one period to the next.">
        {grossSales > 0 && (
          <span className="text-xs text-muted-foreground">
            {formatMoney(leaked)} in total, {Math.round((leaked / grossSales) * 1000) / 10}% of sales
          </span>
        )}
      </SectionHeader>
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg border border-border p-4">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <tile.icon className="h-4 w-4" />
              <Hint tip={tile.hint}>{tile.label}</Hint>
            </p>
            <p className="mt-1 text-xl font-semibold">{tile.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{tile.sub}</p>
          </div>
        ))}
      </div>

      {data.writeOffs.byReason.length > 0 && (
        <div className="flex flex-wrap gap-2 px-5 pb-4 text-xs">
          <span className="text-muted-foreground">Written off as:</span>
          {data.writeOffs.byReason.map((r) => (
            <span key={r.reason} className="rounded-full bg-muted px-2 py-0.5">
              {REASON_LABEL[r.reason] ?? r.reason} · {formatNumber(r.units)} units · {formatMoney(r.value)}
            </span>
          ))}
        </div>
      )}

      {data.discounts.byStaff.length > 0 && (
        <div className="overflow-x-auto border-t border-border">
          <p className="px-5 pt-4 text-sm font-medium">Discounts by staff</p>
          <p className="px-5 text-xs text-muted-foreground">
            Someone discounting far more than the rest may need a word, or a clearer discount rule.
          </p>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-2 font-medium">Staff</th>
                <th className="px-5 py-2 text-right font-medium">Discounts</th>
                <th className="px-5 py-2 text-right font-medium">Bills discounted</th>
                <th className="px-5 py-2 text-right font-medium">
                  <Hint tip="Discounts as a share of what their bills would have been without them.">Share</Hint>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.discounts.byStaff.map((r) => (
                <tr key={r.userId ?? 'none'} className="border-b border-border/60 last:border-0">
                  <td className="px-5 py-2.5 font-medium">{r.name}</td>
                  <td className="px-5 py-2.5 text-right">{formatMoney(r.amount)}</td>
                  <td className="px-5 py-2.5 text-right text-muted-foreground">
                    {formatNumber(r.discounted)} of {formatNumber(r.sales)}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <span className={cn(r.pct > avgPct * 1.5 && r.pct >= 3 && 'font-semibold text-warning')}>
                      {r.pct}%
                    </span>
                    {r.pct > avgPct * 1.5 && r.pct >= 3 && (
                      <span className="ml-1.5 text-xs text-warning">above shop average</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Each branch side by side, for a shop with more than one. */
function StoreComparison({ data }: { data: Analytics['byStore'] }) {
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

function SalesPerformance({ data }: { data: { date: string; revenue: number; orders: number; units: number }[] }) {
  const [metric, setMetric] = useState<'revenue' | 'orders' | 'units'>('revenue');
  const keyMap = { revenue: 'revenue', orders: 'orders', units: 'units' } as const;
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
      <SectionHeader title="Sales by category"
        description="Which kinds of goods your net sales come from. A big slice is a category you depend on: never let it run out." />
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
      <SectionHeader title="Busy hours"
        description="Sales by hour of the day, all days in the period added together. Put more staff on at the peak; restock and clean in the quiet hours." />
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
                  {formatMoney(m.total)} · {m.count} bills
                </p>
              </div>
            ))}
            <p className="border-t border-border pt-3 text-xs text-muted-foreground">
              Total: {orders} bills
            </p>
          </>
        )}
      </div>
    </>
  );
}

function TopProducts({ data }: { data: Analytics['byProduct'] }) {
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
function StaffPerformance({
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

function InventoryPerformance({ data }: { data: Analytics['inventory'] }) {
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
      value: cover == null ? '—' : `${formatNumber(cover)} days`,
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

function NeedsAttention({ data }: { data: Analytics['needsAttention'] }) {
  const items: { label: string; count: number; href: string; cta: string }[] = [
    { label: 'products below minimum stock', count: data.lowStock, href: '/inventory', cta: 'View Stock' },
    { label: "products haven't sold in 30 days", count: data.unsold, href: '/products', cta: 'View Products' },
    { label: 'products expiring within 30 days', count: data.expiring, href: '/inventory', cta: 'View Expiry' },
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