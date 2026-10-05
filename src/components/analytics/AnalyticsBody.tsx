'use client';
import { Banknote, TrendingUp, Receipt, ShoppingBag, Wallet } from 'lucide-react';
import type { Analytics } from '@/types';
import { Card } from '@/components/ui/card';
import { formatMoney, formatNumber, plural } from '@/lib/format';
import { HOUR_LABEL, SalesPerformance, CategoryDonut, HourlySales, PaymentMethods } from './SalesSections';
import { KpiCard } from './parts';
import { MoneyLeaks } from './MoneyLeaks';
import { StoreComparison, TopProducts, StaffPerformance, InventoryPerformance, NeedsAttention } from './PerformanceSections';

export function AnalyticsBody({ data, orderValue }: { data: Analytics; orderValue: number }) {
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
          sub={`${plural(t.units, 'item')} sold`} />
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
