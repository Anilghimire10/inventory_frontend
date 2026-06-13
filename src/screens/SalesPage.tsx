'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt, Printer, Undo2 } from 'lucide-react';
import { SalesApi } from '@/api';
import type { Sale, SaleStatus } from '@/types';
import { PageHeader, LoadingBlock, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Pagination } from './ProductsPage';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { formatMoney, formatDateTime } from '@/lib/format';

const statusTone: Record<SaleStatus, 'success' | 'muted' | 'warning' | 'destructive'> = {
  COMPLETED: 'success',
  HELD: 'muted',
  PARTIALLY_RETURNED: 'warning',
  RETURNED: 'destructive',
};

export default function SalesPage() {
  const qc = useQueryClient();
  const { show } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['sales', page, search],
    queryFn: () => SalesApi.list({ page, limit: 20, search: search || undefined }),
  });
  const detail = useQuery({
    queryKey: ['sale', openId],
    queryFn: () => SalesApi.get(openId!),
    enabled: !!openId,
  });

  const doReturn = useMutation({
    mutationFn: () => {
      const items = Object.entries(returnQty)
        .filter(([, q]) => q > 0)
        .map(([saleItemId, quantity]) => ({ saleItemId, quantity }));
      return SalesApi.return(openId!, { items });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['sale', openId] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      show(`Returned — ${formatMoney(res.refund)} refunded`);
      setReturnQty({});
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const sale = detail.data;

  return (
    <div>
      <PageHeader title="Sales" description="Transaction history and returns." />

      <div className="mb-4 max-w-sm">
        <Input placeholder="Search receipt #…" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>

      {isLoading ? <LoadingBlock /> :
        !data || data.data.length === 0 ? (
          <EmptyState title="No sales yet" description="Completed sales will show up here." icon={Receipt} />
        ) : (
          <>
            <Table>
              <THead><TR><TH>Receipt</TH><TH>When</TH><TH>Customer</TH><TH>Status</TH><TH className="text-right">Total</TH></TR></THead>
              <TBody>
                {data.data.map((s) => (
                  <TR key={s.id} className="cursor-pointer" onClick={() => { setOpenId(s.id); setReturnQty({}); }}>
                    <TD className="font-medium">{s.receiptNo}</TD>
                    <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(s.createdAt)}</TD>
                    <TD>{s.customer?.name ?? 'Walk-in'}</TD>
                    <TD><Badge tone={statusTone[s.status]}>{s.status.replace('_', ' ')}</Badge></TD>
                    <TD className="text-right font-medium">{formatMoney(s.total)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={data.meta.page} pages={data.meta.pages} onPage={setPage} />
          </>
        )}

      <Dialog open={!!openId} onClose={() => setOpenId(null)} title={sale?.receiptNo ?? 'Sale'} className="max-w-lg">
        {!sale ? <LoadingBlock /> : (
          <div id="receipt" className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {formatDateTime(sale.createdAt)} · {sale.customer?.name ?? 'Walk-in'} · {sale.paymentMethod}
              {sale.prescriptionRef && <> · Rx: {sale.prescriptionRef}</>}
            </div>

            <Table>
              <THead><TR><TH>Item</TH><TH className="text-right">Qty</TH><TH className="text-right">Price</TH><TH className="text-right">Total</TH></TR></THead>
              <TBody>
                {sale.items.map((it) => (
                  <TR key={it.id}>
                    <TD>
                      {it.name}
                      {it.returnedQty > 0 && <Badge tone="warning" className="ml-2">{it.returnedQty} returned</Badge>}
                    </TD>
                    <TD className="text-right">{it.quantity}</TD>
                    <TD className="text-right">{formatMoney(it.unitPrice)}</TD>
                    <TD className="text-right">{formatMoney(it.lineTotal)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>

            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatMoney(sale.subtotal)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>{formatMoney(sale.tax)}</span></div>
              {Number(sale.discount) > 0 && <div className="flex justify-between text-muted-foreground"><span>Discount</span><span>- {formatMoney(sale.discount)}</span></div>}
              <div className="flex justify-between border-t border-border pt-1 text-base font-semibold"><span>Total</span><span>{formatMoney(sale.total)}</span></div>
            </div>

            {sale.status !== 'RETURNED' && (
              <ReturnSection sale={sale} returnQty={returnQty} setReturnQty={setReturnQty} />
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          {sale && sale.status !== 'RETURNED' && (
            <Button
              variant="destructive"
              disabled={Object.values(returnQty).every((q) => !q)}
              loading={doReturn.isPending}
              onClick={() => doReturn.mutate()}
            >
              <Undo2 className="h-4 w-4" /> Process return
            </Button>
          )}
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function ReturnSection({
  sale,
  returnQty,
  setReturnQty,
}: {
  sale: Sale;
  returnQty: Record<string, number>;
  setReturnQty: (v: Record<string, number>) => void;
}) {
  const returnable = sale.items.filter((it) => it.quantity - it.returnedQty > 0);
  if (returnable.length === 0) return null;
  return (
    <details className="rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">Return items</summary>
      <div className="mt-3 space-y-2">
        {returnable.map((it) => {
          const max = it.quantity - it.returnedQty;
          return (
            <div key={it.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate">{it.name}</span>
              <span className="text-xs text-muted-foreground">max {max}</span>
              <Input type="number" min="0" max={max} className="h-8 w-20"
                value={returnQty[it.id] ?? 0}
                onChange={(e) =>
                  setReturnQty({ ...returnQty, [it.id]: Math.min(max, Math.max(0, Number(e.target.value))) })
                } />
            </div>
          );
        })}
      </div>
    </details>
  );
}