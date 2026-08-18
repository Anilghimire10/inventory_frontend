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
import { ReportsApi } from '@/api';
import type { Analytics } from '@/types';
import { PageHeader, LoadingBlock } from '@/components/ui/misc';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatNumber } from '@/lib/format';
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

/** Money sign used on this page's figures (NPR -> "Rs.", else currency code). */
function money(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  return `Rs. ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

type RangeKey = 'today' | '7d' | '30d' | 'month' | 'all' | 'custom';

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
    from: from ? `${from}T00:00:00.000Z` : undefined,
    to: to ? `${to}T23:59:59.999Z` : undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', from, to],
    queryFn: () => ReportsApi.analytics(rangeParams),
  });

  const exportAll = () => {
    if (!data) return;
    exportCsv(`analytics_${from ?? 'all'}_${to ?? 'all'}`, [
      { key: 'category', label: 'Category' },
      { key: 'revenue', label: 'Revenue' },
      { key: 'units', label: 'Units' },
      { key: 'share', label: 'Share %' },
    ], data.byCategory);
    exportCsv(`top-products_${from ?? 'all'}_${to ?? 'all'}`, [
      { key: 'name', label: 'Product' },
      { key: 'quantitySold', label: 'Qty sold' },
      { key: 'revenue', label: 'Revenue' },
      { key: 'cost', label: 'Cost' },
      { key: 'profit', label: 'Profit' },
    ], data.byProduct);
  };

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
        <div className="flex items-center gap-2">
          <Input type="date" className="h-8 w-auto" value={customFrom}
            onChange={(e) => { setCustomFrom(e.target.value); setRange('custom'); }} />
          <span className="text-sm text-muted-foreground">to</span>
          <Input type="date" className="h-8 w-auto" value={customTo}
            onChange={(e) => { setCustomTo(e.target.value); setRange('custom'); }} />
        </div>
        <Button size="sm" variant="outline" className="ml-auto" onClick={exportAll}
          disabled={!data}>
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>

      {isLoading || !data ? (
        <LoadingBlock />
      ) : (
        <AnalyticsBody data={data} orderValue={orderValue} />
      )}
    </div>
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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard icon={Banknote} tone="primary" label="Revenue"
          value={money(data.totals.grossSales)} delta={revDelta} money />
        <KpiCard icon={TrendingUp} tone="primary" label="Gross Profit"
          value={money(data.totals.profit)} delta={profitDelta} money />
        <KpiCard icon={Receipt} tone="primary" label="Orders"
          value={formatNumber(data.totals.transactions)} delta={ordersDelta} />
        <KpiCard icon={ShoppingBag} tone="primary" label="Avg. Order Value"
          value={money(orderValue)} delta={aovDelta} money />
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
  icon: Icon, label, value, delta, tone, money: isMoney,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; delta: number | null;
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
          <p className="text-sm text-muted-foreground">{label}</p>
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
                  <span className="text-xs text-muted-foreground">{money(c.revenue)}</span>
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
              <Bar dataKey="total" fill={PRIMARY} radius={[4, 4, 0, 0]} />
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
                  {money(m.total)} · {m.count} sales
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

function TopProducts({ data }: { data: Analytics['byProduct'] }) {
  const top = data.slice(0, 5);
  return (
    <>
      <div className="flex items-center gap-2 border-b border-border p-5">
        <PackageSearch className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Top Selling Products</h2>
        {data.length > 5 && (
          <Link href="/products" className="ml-auto text-sm font-medium text-primary hover:underline">
            View all →
          </Link>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-medium">Product</th>
              <th className="px-5 py-3 text-right font-medium">Units</th>
              <th className="px-5 py-3 text-right font-medium">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {top.length === 0 && (
              <tr><td className="px-5 py-8 text-center text-muted-foreground" colSpan={3}>No sales in this period.</td></tr>
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
                <td className="px-5 py-3 text-right font-medium">{money(p.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function InventoryPerformance({ data }: { data: Analytics['inventory'] }) {
  const rows: { label: string; value: string; sub: string }[] = [
    { label: 'Stock Turnover', value: `${data.stockTurnover}x`, sub: 'COGS ÷ inventory value' },
    { label: 'Sell-through', value: `${data.sellThrough}%`, sub: 'units sold vs. on hand' },
    { label: 'Dead Stock', value: `${data.deadStockPct}%`, sub: money(data.deadStockValue) },
    { label: 'Inventory Value', value: money(data.value), sub: 'at cost' },
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
            <p className="text-sm text-muted-foreground">{r.label}</p>
            <p className="mt-0.5 text-xl font-semibold">{r.value}</p>
            <p className="text-xs text-muted-foreground">{r.sub}</p>
          </div>
        ))}
      </div>
    </>
  );
}

function StockMovement({ data }: { data: Analytics['stockMovement'] }) {
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
            <LineChart data={data.map((d) => ({ ...d, date: d.date.slice(5) }))}
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
            {moneyKeys.includes(p.dataKey) ? money(p.value) : formatNumber(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}