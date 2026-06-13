'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  DollarSign,
  ShoppingBag,
  AlertTriangle,
  CalendarClock,
  Boxes,
  TrendingUp,
} from 'lucide-react';
import { ReportsApi } from '@/api';
import { PageHeader, LoadingBlock, EmptyState } from '@/components/ui/misc';
import { Card } from '@/components/ui/card';
import { formatMoney } from '@/lib/format';
import { useAuth } from '@/auth/AuthContext';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => ReportsApi.dashboard(),
  });

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.name?.split(' ')[0] ?? ''}`}
        description="Here's how your business is doing today."
      />

      {isLoading || !data ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Today's Sales"
              value={formatMoney(data.todaySalesTotal)}
              sub={`${data.todaySalesCount} transactions`}
              icon={DollarSign}
              tone="primary"
            />
            <Stat
              label="Inventory Value"
              value={formatMoney(data.inventoryValue)}
              sub="at cost price"
              icon={Boxes}
              tone="default"
            />
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

          <Card className="mt-6">
            <div className="flex items-center gap-2 border-b border-border p-5">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Top selling products</h2>
            </div>
            <div className="p-5">
              {data.topProducts.length === 0 ? (
                <EmptyState
                  title="No sales yet"
                  description="Your best sellers will appear here once you start selling."
                  icon={ShoppingBag}
                />
              ) : (
                <ul className="space-y-3">
                  {data.topProducts.map((p, i) => (
                    <li key={p.productId} className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {i + 1}
                      </span>
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="text-sm font-medium text-muted-foreground">
                        {p.quantitySold} sold
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </>
      )}
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
  tone: 'primary' | 'default' | 'warning' | 'destructive';
  to?: string;
}) {
  const toneClasses = {
    primary: 'bg-primary/10 text-primary',
    default: 'bg-secondary text-secondary-foreground',
    warning: 'bg-warning/15 text-warning',
    destructive: 'bg-destructive/10 text-destructive',
  }[tone];

  const inner = (
    <Card className={cn('p-5', to && 'transition-colors hover:border-primary/50')}>
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

  return to ? <Link href={to}>{inner}</Link> : inner;
}
