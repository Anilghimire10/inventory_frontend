'use client';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DollarSign,
  TrendingUp,
  Percent,
  Receipt,
  Coins,
  PackageSearch,
  Download,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { ReportsApi } from '@/api';
import type { ProductAnalytics } from '@/types';
import { PageHeader, LoadingBlock, EmptyState } from '@/components/ui/misc';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/format';
import { exportCsv } from '@/lib/csv';
import { cn } from '@/lib/utils';

const PRIMARY = 'hsl(var(--primary))';

type RangeKey = 'today' | '7d' | '30d' | 'month' | 'all' | 'custom';

/** Build YYYY-MM-DD for `daysAgo` days before today (local). */
function dayStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}
function monthStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
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

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', from, to],
    queryFn: () =>
      ReportsApi.analytics({
        from: from ? `${from}T00:00:00.000Z` : undefined,
        to: to ? `${to}T23:59:59.999Z` : undefined,
      }),
  });

  return (
    <div>
      <PageHeader title="Analytics" description="Sales performance, profit, and best-selling items." />

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
        <div className="flex items-center gap-2">
          <Input type="date" className="h-8 w-auto" value={customFrom}
            onChange={(e) => { setCustomFrom(e.target.value); setRange('custom'); }} />
          <span className="text-sm text-muted-foreground">to</span>
          <Input type="date" className="h-8 w-auto" value={customTo}
            onChange={(e) => { setCustomTo(e.target.value); setRange('custom'); }} />
        </div>
      </div>

      {isLoading || !data ? (
        <LoadingBlock />
      ) : (
        <>
          {/* Totals */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Gross Sales" value={formatMoney(data.totals.grossSales)}
              sub={`${data.totals.transactions} transactions`} icon={DollarSign} tone="primary" />
            <Stat label="Net Revenue" value={formatMoney(data.totals.netRevenue)}
              sub="excluding tax" icon={Receipt} tone="default" />
            <Stat label="Profit" value={formatMoney(data.totals.profit)}
              sub={`cost ${formatMoney(data.totals.cost)}`} icon={TrendingUp}
              tone={data.totals.profit >= 0 ? 'success' : 'destructive'} />
            <Stat label="Margin" value={`${data.totals.margin}%`}
              sub="profit / revenue" icon={Percent} tone="default" />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Sales by item */}
            <Card className="lg:col-span-2">
              <div className="flex items-center gap-2 border-b border-border p-5">
                <PackageSearch className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">Sales by item</h2>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto"
                  disabled={data.byProduct.length === 0}
                  onClick={() =>
                    exportCsv(
                      `sales-by-item_${from ?? 'all'}_${to ?? 'all'}`,
                      [
                        { key: 'name', label: 'Product' },
                        { key: 'quantitySold', label: 'Qty sold' },
                        { key: 'revenue', label: 'Revenue' },
                        { key: 'cost', label: 'Cost' },
                        { key: 'profit', label: 'Profit' },
                      ],
                      data.byProduct,
                    )
                  }
                >
                  <Download className="h-4 w-4" /> Export CSV
                </Button>
              </div>

              {data.byProduct.length > 0 && (
                <div className="border-b border-border p-5">
                  <p className="mb-3 text-sm text-muted-foreground">Top products by profit</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={data.byProduct.slice(0, 8).map((p) => ({
                        name: p.name.length > 14 ? p.name.slice(0, 14) + '…' : p.name,
                        profit: p.profit,
                      }))}
                      margin={{ top: 0, right: 8, left: -8, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        interval={0} angle={-20} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={48} />
                      <Tooltip content={<ChartTooltip moneyKeys={['profit']} />} cursor={{ fill: 'hsl(var(--accent))' }} />
                      <Bar dataKey="profit" fill={PRIMARY} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="p-2">
                {data.byProduct.length === 0 ? (
                  <EmptyState title="No sales in this period" description="Try a wider date range." icon={Coins} />
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Product</TH>
                        <TH className="text-right">Qty</TH>
                        <TH className="text-right">Revenue</TH>
                        <TH className="text-right">Cost</TH>
                        <TH className="text-right">Profit</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {data.byProduct.map((p) => (
                        <ItemRow key={p.productId} p={p} />
                      ))}
                    </TBody>
                  </Table>
                )}
              </div>
            </Card>

            {/* Side: payments + daily */}
            <div className="space-y-6">
              <Card>
                <div className="border-b border-border p-5"><h2 className="font-semibold">Payment methods</h2></div>
                <div className="space-y-3 p-5">
                  {data.byPaymentMethod.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No data.</p>
                  ) : data.byPaymentMethod.map((m) => (
                    <div key={m.method} className="flex items-center justify-between text-sm">
                      <Badge tone="muted">{m.method}</Badge>
                      <div className="text-right">
                        <div className="font-medium">{formatMoney(m.total)}</div>
                        <div className="text-xs text-muted-foreground">{m.count} sales</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <div className="flex items-center border-b border-border p-5">
                  <h2 className="font-semibold">Daily sales</h2>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    disabled={data.byDay.length === 0}
                    onClick={() =>
                      exportCsv(
                        `daily-sales_${from ?? 'all'}_${to ?? 'all'}`,
                        [
                          { key: 'date', label: 'Date' },
                          { key: 'count', label: 'Transactions' },
                          { key: 'total', label: 'Total' },
                        ],
                        data.byDay,
                      )
                    }
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
                <div className="p-3">
                  {data.byDay.length === 0 ? (
                    <p className="p-2 text-sm text-muted-foreground">No data.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={data.byDay.map((d) => ({ date: d.date.slice(5), total: d.total }))}
                        margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                        <defs>
                          <linearGradient id="fillTotal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={PRIMARY} stopOpacity={0.4} />
                            <stop offset="95%" stopColor={PRIMARY} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={48} />
                        <Tooltip content={<ChartTooltip moneyKeys={['total']} />} />
                        <Area type="monotone" dataKey="total" stroke={PRIMARY} strokeWidth={2}
                          fill="url(#fillTotal)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Themed tooltip for the recharts visuals. */
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
            {moneyKeys.includes(p.dataKey) ? formatMoney(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function ItemRow({ p }: { p: ProductAnalytics }) {
  const margin = p.revenue > 0 ? Math.round((p.profit / p.revenue) * 100) : 0;
  return (
    <TR>
      <TD className="font-medium">{p.name}</TD>
      <TD className="text-right">{p.quantitySold}</TD>
      <TD className="text-right">{formatMoney(p.revenue)}</TD>
      <TD className="text-right text-muted-foreground">{formatMoney(p.cost)}</TD>
      <TD className="text-right">
        <span className={cn('font-medium', p.profit >= 0 ? 'text-success' : 'text-destructive')}>
          {formatMoney(p.profit)}
        </span>
        <span className="ml-1 text-xs text-muted-foreground">({margin}%)</span>
      </TD>
    </TR>
  );
}

function Stat({
  label, value, sub, icon: Icon, tone,
}: {
  label: string; value: string; sub: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'primary' | 'default' | 'success' | 'destructive';
}) {
  const toneClasses = {
    primary: 'bg-primary/10 text-primary',
    default: 'bg-secondary text-secondary-foreground',
    success: 'bg-success/15 text-success',
    destructive: 'bg-destructive/10 text-destructive',
  }[tone];
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        </div>
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', toneClasses)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}