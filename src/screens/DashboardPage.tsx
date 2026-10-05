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
  HandCoins,
} from 'lucide-react';
import { ReportsApi } from '@/api';
import { BarsChart, TrendChart } from '@/components/charts';
import { PageHeader, LoadingBlock, EmptyState, ErrorState } from '@/components/ui/misc';
import { useStoreLabel } from '@/components/StorePicker';
import { useStoreScope } from '@/store/StoreContext';
import { Card } from '@/components/ui/card';
import { formatMoney, plural } from '@/lib/format';
import { liveRefetchInterval } from '@/lib/live';
import { useAuth } from '@/auth/AuthContext';
import { can } from '@/lib/permissions';
import { GettingStarted } from '@/components/GettingStarted';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const { user } = useAuth();
  const showMoney = !!user && can.viewFinancials(user.role);
  // App-wide selection: switching in the header moves this page too.
  const { storeId } = useStoreScope();
  const storeLabel = useStoreLabel(storeId);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard', storeId],
    queryFn: () => ReportsApi.dashboard(storeId || undefined),
    refetchInterval: liveRefetchInterval,
  });

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.name?.split(' ')[0] ?? ''}`}
        description={
          storeLabel
            ? `Here's how ${storeLabel === 'all stores' ? 'your business' : storeLabel} is doing.`
            : "Here's how your business is doing."
        }
      />

      {user && can.manageBusiness(user.role) && user.business && <GettingStarted businessId={user.business.id} />}

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <LoadingBlock />
      ) : (
        <>
          {/* Stat cards */}
          <div
            className={cn(
              'grid grid-cols-1 gap-4 sm:grid-cols-2',
              showMoney ? 'xl:grid-cols-5' : 'xl:grid-cols-4',
            )}
          >
            {showMoney ? (
              <Stat
                label="Total Sales"
                value={formatMoney(data.totalSalesTotal ?? 0)}
                sub={`${plural(data.totalSalesCount, 'transaction')}, all time`}
                icon={Banknote}
                tone="primary"
              />
            ) : (
              <Stat
                label="Total Sales"
                value={String(data.totalSalesCount)}
                sub={data.totalSalesCount === 1 ? 'transaction, all time' : 'transactions, all time'}
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
            {showMoney && (
              // Money already out the door. An owner running udhaaro usually
              // wants this before margin, so it sits on the home screen rather
              // than inside Analytics. The tile turns warning-toned the moment
              // any of it is over 30 days old.
              <Stat
                label="Owed to You"
                value={formatMoney(data.creditOutstanding ?? 0)}
                sub={
                  (data.creditOverdue ?? 0) > 0
                    ? `${formatMoney(data.creditOverdue ?? 0)} over 30 days`
                    : `${plural(data.creditCustomersOwing, 'customer')} on credit`
                }
                icon={HandCoins}
                tone={(data.creditOverdue ?? 0) > 0 ? 'warning' : 'default'}
                to="/credit"
              />
            )}
            <Stat
              label="Low Stock"
              value={String(data.lowStockCount)}
              sub="items need restocking"
              icon={AlertTriangle}
              tone={data.lowStockCount > 0 ? 'warning' : 'default'}
              to="/inventory?tab=low"
            />
            <Stat
              label="Expiring Soon"
              value={String(data.expiringSoonCount)}
              sub="within 30 days"
              icon={CalendarClock}
              tone={data.expiringSoonCount > 0 ? 'destructive' : 'default'}
              to="/inventory?tab=expiring"
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
                <TrendChart
                  data={(data.salesTrend ?? []).map((d) => ({ date: d.date.slice(5), total: d.total }))}
                  xKey="date"
                  yKey="total"
                  name="Revenue"
                  money
                  height={240}
                />
              </ChartCard>

              <ChartCard
                title="Hourly sales today"
                subtitle="Today's revenue by hour"
                icon={Clock}
                empty={!data.hourlyToday?.some((h) => h.total > 0)}
              >
                <BarsChart
                  data={(data.hourlyToday ?? [])
                    .filter((h) => h.total > 0)
                    .map((h) => ({
                      label: h.hour === 12 ? '12 PM' : h.hour === 0 ? '12 AM' : `${h.hour % 12} ${h.hour < 12 ? 'AM' : 'PM'}`,
                      total: h.total,
                    }))}
                  xKey="label"
                  yKey="total"
                  name="Revenue"
                  money
                  height={240}
                  maxBarSize={48}
                />
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
