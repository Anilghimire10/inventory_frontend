'use client';
import { AlertTriangle, TicketPercent, Undo2, PackageX, HandCoins } from 'lucide-react';
import type { Analytics } from '@/types';
import { Hint } from '@/components/ui/tooltip';
import { formatMoney, formatNumber, plural } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SectionHeader } from './parts';

const REASON_LABEL: Record<string, string> = {
  DAMAGE: 'Damaged',
  EXPIRED: 'Expired',
  THEFT: 'Stolen or lost',
  COUNT_CORRECTION: 'Missing at a count',
  OTHER: 'Other',
};

/**
 * Money that left without becoming profit: discounts, refunds, stock written
 * off, and till expenses -- plus who gave the discounts, which is where a
 * problem usually shows first.
 */
export function MoneyLeaks({ data, grossSales }: { data: Analytics['money']; grossSales: number }) {
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
      sub: `${data.discounts.pct}% off · on ${plural(data.discounts.salesWithDiscount, 'bill')}`,
    },
    {
      icon: Undo2,
      label: 'Refunds paid',
      hint: 'Cash handed back to customers on returns in this period. Returns on credit sales cancel what the customer owed instead, so they aren’t counted here.',
      value: formatMoney(data.refunds.total),
      sub: `${plural(data.refunds.count, 'refund')} · ${plural(data.refunds.unitsReturned, 'unit')} back · ${data.refunds.returnRate}% of bills`,
    },
    {
      icon: PackageX,
      label: 'Stock written off',
      hint: 'Stock removed by hand as damaged, expired, stolen or missing at a count, valued at today’s cost price. It is taken off net profit.',
      value: formatMoney(data.writeOffs.value),
      sub: plural(data.writeOffs.units, 'unit'),
    },
    {
      icon: HandCoins,
      label: 'Expenses from the till',
      hint: 'Cash paid out of the drawer as an expense (Cash in/out → Expense). Taken off net profit. Owner drawings aren’t a cost, so they are shown separately.',
      value: formatMoney(data.expenses.total),
      sub:
        plural(data.expenses.count, 'payout') +
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
              {REASON_LABEL[r.reason] ?? r.reason} · {plural(r.units, 'unit')} · {formatMoney(r.value)}
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
