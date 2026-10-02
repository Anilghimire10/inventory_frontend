'use client';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { ReportsApi } from '@/api';
import { LoadingBlock, ErrorState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/format';
import { exportCsv } from '@/lib/csv';
import { cn } from '@/lib/utils';

/**
 * VAT/tax collected over the selected range, split by rate, less the VAT
 * paid to suppliers on goods received — what a shop copies onto its tax
 * return. Zero-rated and exempt lines still count toward
 * the taxable base, so `byRate` (rates above 0 only) can total less than
 * `taxableAmount`; the summary row is the authority, not the sum of the table.
 */
export function TaxReportCard({
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
            Tax collected on completed sales and paid on purchases received, {label}. Returned items are excluded.
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
          <div className="grid grid-cols-1 gap-px border-t border-border bg-border sm:grid-cols-3">
            <TaxFigure label="Purchases with VAT" value={data.purchases.taxableAmount} />
            <TaxFigure label="VAT paid on purchases" value={data.purchases.taxPaid} />
            <TaxFigure
              label={data.netTax < 0 ? 'VAT credit carried' : 'Net VAT to pay'}
              value={Math.abs(data.netTax)}
              accent
            />
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
