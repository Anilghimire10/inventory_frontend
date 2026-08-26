'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Banknote,
  ShoppingBag,
  AlertTriangle,
  CalendarClock,
  Boxes,
  TrendingUp,
  TrendingDown,
  Receipt,
  Clock,
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
import { PageHeader, LoadingBlock, EmptyState, ErrorState } from '@/components/ui/misc';
import { Card } from '@/components/ui/card';
import { formatMoney } from '@/lib/format';
import { useAuth } from '@/auth/AuthContext';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';

const PRIMARY = 'hsl(var(--primary))';

export default function DashboardPage() {
  const { user } = useAuth();
  const showMoney = !!user && can.viewFinancials(user.role);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => ReportsApi.dashboard(),
  });

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.name?.split(' ')[0] ?? ''}`}
        description="Here's how your business is doing today."
      />

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <LoadingBlock />
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {showMoney ? (
              <Stat
                label="Total Sales"
                value={formatMoney(data.totalSalesTotal ?? 0)}
                sub={`${data.totalSalesCount} transactions`}
                icon={Banknote}
                tone="primary"
              />
            ) : (
              <Stat
                label="Total Sales"
                value={String(data.totalSalesCount)}
                sub="transactions"
                icon={Receipt}
                tone="primary"
              />
            )}
            {showMoney && (
              <Stat
                label="Inventory Value"
                value={formatMoney(data.inventoryValue ?? 0)}
                sub="at cost price"
                icon={Boxes}
                tone="primary"
              />
            )}
            <Stat
              label="Low Stock"
              value={String(data.lowStockCount)}
              sub="items need restocking"
              icon={AlertTriangle}
              tone={data.lowStockCount > 0 ? 'warning' : 'default'}
              to="/inventory"
            />
            <Stat
              label="Expiring Soon"
              value={String(data.expiringSoonCount)}
              sub="within 30 days"
              icon={CalendarClock}
              tone={data.expiringSoonCount > 0 ? 'destructive' : 'default'}
              to="/inventory"
            />
          </div>

          {/* Revenue charts (owner only) */}
          {showMoney && (
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ChartCard
                title="Sales & revenue trend"
                subtitle="Last 14 days"
                icon={TrendingUp}
                tone="text-primary"
                empty={!data.salesTrend?.some((d) => d.total > 0)}
              >
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart
                    data={(data.salesTrend ?? []).map((d) => ({
                      date: d.date.slice(5),
                      total: d.total,
                    }))}
                    margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="dashFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={PRIMARY} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={PRIMARY} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={48} />
                    <Tooltip content={<ChartTooltip moneyKeys={['total']} />} />
                    <Area type="monotone" dataKey="total" name="Revenue" stroke={PRIMARY} strokeWidth={2} fill="url(#dashFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard
                title="Hourly sales today"
                subtitle="Today's revenue by hour"
                icon={Clock}
                empty={!data.hourlyToday?.some((h) => h.total > 0)}
              >
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={(data.hourlyToday ?? [])
                      .filter((h) => h.total > 0)
                      .map((h) => ({
                        label: h.hour === 12 ? '12 PM' : h.hour === 0 ? '12 AM' : `${h.hour % 12} ${h.hour < 12 ? 'AM' : 'PM'}`,
                        total: h.total,
                      }))}
                    margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                    maxBarSize={48}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={48} />
                    <Tooltip content={<ChartTooltip moneyKeys={['total']} />} cursor={{ fill: 'hsl(var(--accent))' }} />
                    <Bar dataKey="total" name="Revenue" fill={PRIMARY} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}

          {/* Top & slow movers */}
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ListCard
              title="Top selling products"
              subtitle="By units sold"
              icon={TrendingUp}
              tone="text-primary"
              empty={data.topProducts.length === 0}
              emptyText="Your best sellers will appear here once you start selling."
            >
              {data.topProducts.map((p, i) => (
                <li
                  key={p.productId}
                  className="flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/60"
                >
                  <Rank n={i + 1} tone="bg-primary/10 text-primary" />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-sm font-medium text-muted-foreground">{p.quantitySold} sold</span>
                </li>
              ))}
            </ListCard>

            <ListCard
              title="Slow moving products"
              subtitle="In stock, fewest sold (30 days)"
              icon={TrendingDown}
              tone="text-warning"
              empty={data.slowProducts.length === 0}
              emptyText="No stocked products yet."
            >
              {data.slowProducts.map((p) => (
                <li
                  key={p.productId}
                  className="flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/60"
                >
                  <Rank n={p.inStock} tone="bg-warning/15 text-warning" label="in stock" pill />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-sm font-medium text-muted-foreground">{p.quantitySold} sold</span>
                </li>
              ))}
            </ListCard>
          </div>
        </>
      )}
    </div>
  );
}

function Rank({
  n,
  tone,
  label,
  pill,
}: {
  n: number;
  tone: string;
  label?: string;
  pill?: boolean;
}) {
  return (
    <span
      className={cn(
        'flex h-8 min-w-8 items-center justify-center px-2 text-xs font-semibold',
        pill ? 'rounded-md' : 'rounded-full',
        tone,
      )}
      title={label}
    >
      {n}
    </span>
  );
}

function ListCard({
  title,
  subtitle,
  icon: Icon,
  tone,
  empty,
  emptyText,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  empty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border p-5">
        <Icon className={cn('h-5 w-5', tone)} />
        <div>
          <h2 className="font-semibold leading-tight">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="p-2">
        {empty ? (
          <EmptyState title="Nothing to show yet" description={emptyText} icon={ShoppingBag} />
        ) : (
          <ul className="space-y-1">{children}</ul>
        )}
      </div>
    </Card>
  );
}

function ChartCard({
  title,
  subtitle,
  icon: Icon,
  tone = 'text-primary',
  empty,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border p-5">
        <Icon className={cn('h-5 w-5', tone)} />
        <div>
          <h2 className="font-semibold leading-tight">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="p-3">
        {empty ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No sales recorded yet.</p>
        ) : (
          children
        )}
      </div>
    </Card>
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

function Stat({
  label,
  value,
  sub,
  icon: Icon,
  tone,
  to,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'primary' | 'default' | 'success' | 'warning' | 'destructive';
  to?: string;
}) {
  const toneClasses = {
    primary: 'bg-primary/10 text-primary',
    default: 'bg-secondary text-secondary-foreground',
    success: 'bg-success/15 text-success',
    warning: 'bg-warning/15 text-warning',
    destructive: 'bg-destructive/10 text-destructive',
  }[tone];

  const inner = (
    <Card className={cn('p-5', to && 'transition-colors hover:border-primary/50')}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        </div>
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', toneClasses)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );

  return to ? <Link href={to}>{inner}</Link> : inner;
}
