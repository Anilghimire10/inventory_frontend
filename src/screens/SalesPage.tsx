'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Receipt,
  Printer,
  Undo2,
  Mail,
  FileDown,
  Search,
  Check,
  MoreVertical,
  Banknote,
  TrendingUp,
} from 'lucide-react';
import { SalesApi } from '@/api';
import type { PaymentMethod, Sale, SaleItem, SaleListItem } from '@/types';
import { PageHeader, LoadingBlock, EmptyState, ErrorState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { printSale } from '@/lib/print';
import { formatMoney, formatDateTime } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type DateFilter = 'all' | 'today' | '7d' | '30d';
type StatusFilter = 'all' | 'paid' | 'due' | 'partial' | 'return' | 'held';

type StatusView = {
  key: string;
  label: string;
  tone: 'success' | 'muted' | 'warning' | 'destructive';
  paid?: boolean;
};

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  MOBILE: 'Mobile',
  CREDIT: 'Credit',
  MIXED: 'Cash + Credit',
};

const CUTOFF_MS: Record<Exclude<DateFilter, 'all'>, number> = {
  today: 24 * 3600 * 1000,
  '7d': 7 * 24 * 3600 * 1000,
  '30d': 30 * 24 * 3600 * 1000,
};

function cutoffDate(filter: Exclude<DateFilter, 'all'>): string {
  return new Date(Date.now() - CUTOFF_MS[filter]).toISOString();
}

/** Friendly, payment-aware status: credit sales read as "Due", part-paid as "Partial". */
function viewStatus(s: SaleListItem): StatusView {
  if (s.status === 'RETURNED') return { key: 'return', label: 'Return', tone: 'destructive' };
  if (s.status === 'PARTIALLY_RETURNED')
    return { key: 'return', label: 'Part return', tone: 'warning' };
  if (s.status === 'HELD') return { key: 'held', label: 'Held', tone: 'muted' };
  if (s.paymentMethod === 'CREDIT') return { key: 'due', label: 'Due', tone: 'destructive' };
  if (s.paymentMethod === 'MIXED') return { key: 'partial', label: 'Partial', tone: 'warning' };
  return { key: 'paid', label: 'Paid', tone: 'success', paid: true };
}

export default function SalesPage() {
  const qc = useQueryClient();
  const { show } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [payFilter, setPayFilter] = useState<'all' | PaymentMethod>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['sales', page, search, dateFilter, statusFilter, payFilter],
    queryFn: () =>
      SalesApi.list({
        page,
        limit: 20,
        search: search || undefined,
        from: dateFilter === 'all' ? undefined : cutoffDate(dateFilter),
        status: statusFilter === 'all' ? undefined : statusFilter,
        paymentMethod: payFilter === 'all' ? undefined : payFilter,
      }),
  });
  const detail = useQuery({
    queryKey: ['sale', openId],
    queryFn: () => SalesApi.get(openId!),
    enabled: !!openId,
  });

  const sales = data?.data ?? [];

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

  const emailReceipt = useMutation({
    mutationFn: () => SalesApi.emailReceipt(openId!),
    onSuccess: (res) => show(res.message),
    onError: (e) => show(apiError(e), 'error'),
  });

  const emailOne = useMutation({
    mutationFn: (id: string) => SalesApi.emailReceipt(id),
    onSuccess: (res) => show(res.message),
    onError: (e) => show(apiError(e), 'error'),
  });

  const printOne = async (id: string) => {
    try {
      const full = await SalesApi.get(id);
      printSale(full, 'thermal');
    } catch (e) {
      show(apiError(e), 'error');
    }
  };

  const sale = detail.data;
  const hasFilters = search !== '' || dateFilter !== 'all' || statusFilter !== 'all' || payFilter !== 'all';

  return (
    <div>
      <PageHeader title="Sales" description="Transaction history and returns." />

{/* Summary cards — always today's completed sales */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SaleStat
          label="Today's Sales"
          value={formatMoney(data?.meta.todayRevenue ?? 0)}
          sub="Total from all completed sales today"
          icon={Banknote}
          tone="bg-primary/10 text-primary"
        />
        <SaleStat
          label="Transactions"
          value={String(data?.meta.todayCount ?? 0)}
          sub="Number of receipts made today"
          icon={Receipt}
          tone="bg-primary/10 text-primary"
        />
        <SaleStat
          label="Average Sale"
          value={formatMoney(
            (data?.meta.todayCount ?? 0) > 0
              ? (data?.meta.todayRevenue ?? 0) / (data?.meta.todayCount ?? 1)
              : 0,
          )}
          sub="Average of today's sales"
          icon={TrendingUp}
          tone="bg-primary/10 text-primary"
        />
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search receipt #…" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="w-full sm:w-36">
          <Select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as DateFilter)}>
            <option value="all">All dates</option>
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </Select>
        </div>
        <div className="w-full sm:w-36">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
            <option value="all">All statuses</option>
            <option value="paid">Paid</option>
            <option value="due">Due</option>
            <option value="partial">Partial</option>
            <option value="return">Return</option>
            <option value="held">Held</option>
          </Select>
        </div>
        <div className="w-full sm:w-40">
          <Select value={payFilter} onChange={(e) => setPayFilter(e.target.value as 'all' | PaymentMethod)}>
            <option value="all">All payments</option>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="MOBILE">Mobile</option>
            <option value="CREDIT">Credit</option>
            <option value="MIXED">Cash + Credit</option>
          </Select>
        </div>
      </div>

      {isError ? <ErrorState onRetry={() => refetch()} /> :
        isLoading ? <LoadingBlock /> :
        !data || data.data.length === 0 ? (
          hasFilters ? (
            <EmptyState title="No sales match your filters" description="Try widening your date, status, or payment filters." icon={Search} />
          ) : (
            <EmptyState title="No sales yet" description="Completed sales will show up here." icon={Receipt} />
          )
        ) : (
          <>
            <Table>
              <THead><TR><TH>Receipt</TH><TH>When</TH><TH>Customer</TH><TH>Payment</TH><TH>Status</TH><TH className="text-right">Total</TH><TH /></TR></THead>
              <TBody>
                {sales.map((s) => {
                  const v = viewStatus(s);
                  return (
                    <TR key={s.id} className="cursor-pointer" onClick={() => { setOpenId(s.id); setReturnQty({}); }}>
                      <TD className="font-medium">{s.receiptNo}</TD>
                      <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(s.createdAt)}</TD>
                      <TD>{s.customer?.name ?? 'Walk-in'}</TD>
                      <TD className="text-muted-foreground">{PAYMENT_LABEL[s.paymentMethod ?? 'CASH']}</TD>
                      <TD>
                        <Badge tone={v.tone} className="gap-1">
                          {v.paid && <Check className="h-3 w-3" />}
                          {v.label}
                        </Badge>
                      </TD>
                      <TD className="text-right font-medium">{formatMoney(s.total)}</TD>
                      <TD>
                        <div className="flex justify-end">
                          <RowMenu
                            onPrint={() => printOne(s.id)}
                            onEmail={() => emailOne.mutate(s.id)}
                          />
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <Pagination page={data.meta.page} pages={data.meta.pages} onPage={setPage} />
          </>
        )}

      <Dialog open={!!openId} onClose={() => setOpenId(null)} title={sale?.receiptNo ?? 'Sale'} className="max-w-2xl">
        {!sale ? <LoadingBlock /> : (() => {
          const due = Math.max(0, Number(sale.total) - Number(sale.amountPaid));
          const showPan = !!(sale.business?.showTaxIdOnBill && sale.business?.taxId);
          return (
          <div id="receipt" className="space-y-4">
            {/* Invoice header — business + bill-to */}
            <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4 rounded-md border border-border p-4">
              <div className="text-sm">
                <div className="text-base font-semibold">{sale.business?.name ?? sale.store?.name ?? 'Invoice'}</div>
                {sale.store?.address && <div className="text-muted-foreground">{sale.store.address}</div>}
                {sale.store?.phone && <div className="text-muted-foreground">{sale.store.phone}</div>}
                {showPan && <div className="text-muted-foreground">PAN/VAT: {sale.business?.taxId}</div>}
              </div>
              <div className="text-left sm:text-right text-sm">
                <div className="font-semibold">{sale.receiptNo}</div>
                <div className="text-muted-foreground">{formatDateTime(sale.createdAt)}</div>
                <div className="text-muted-foreground">Payment: {PAYMENT_LABEL[sale.paymentMethod ?? 'CASH']}</div>
                {sale.prescriptionRef && <div className="text-muted-foreground">Rx: {sale.prescriptionRef}</div>}
              </div>
            </div>

            <div className="text-sm">
              <div className="text-xs uppercase text-muted-foreground">Bill to</div>
              <div className="font-medium">{sale.customer?.name ?? 'Walk-in customer'}</div>
              {sale.customer?.phone && <div className="text-muted-foreground">{sale.customer.phone}</div>}
              {sale.customer?.address && <div className="text-muted-foreground">{sale.customer.address}</div>}
            </div>

            <Table>
              <THead><TR><TH>Item</TH><TH className="text-right">Qty</TH><TH className="text-right">Price</TH><TH className="text-right">Disc</TH><TH className="text-right">Tax</TH><TH className="text-right">Total</TH></TR></THead>
              <TBody>
                {sale.items.map((it) => (
                  <TR key={it.id}>
                    <TD>
                      {it.name}
                      {Number(it.returnedQty) > 0 && <Badge tone="warning" className="ml-2">{it.returnedQty} returned</Badge>}
                    </TD>
                    <TD className="text-right">{it.quantity}</TD>
                    <TD className="text-right">{formatMoney(it.unitPrice)}</TD>
                    <TD className="text-right">{Number(it.discount) > 0 ? `- ${formatMoney(it.discount)}` : '—'}</TD>
                    <TD className="text-right">{Number(it.taxRate) || 0}%</TD>
                    <TD className="text-right">{formatMoney(it.lineTotal)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>

            <div className="flex justify-end">
              <div className="w-full max-w-xs space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatMoney(sale.subtotal)}</span></div>
                {Number(sale.discount) > 0 && <div className="flex justify-between text-muted-foreground"><span>Discount</span><span>- {formatMoney(sale.discount)}</span></div>}
                <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>{formatMoney(sale.tax)}</span></div>
                <div className="flex justify-between border-t border-border pt-1 text-base font-semibold"><span>Total</span><span>{formatMoney(sale.total)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Paid</span><span>{formatMoney(sale.amountPaid)}</span></div>
                {due > 0 && <div className="flex justify-between font-medium text-destructive"><span>Balance due</span><span>{formatMoney(due)}</span></div>}
              </div>
            </div>

            {sale.status !== 'RETURNED' && (
              <ReturnSection sale={sale} returnQty={returnQty} setReturnQty={setReturnQty} />
            )}
          </div>
          );
        })()}
        <DialogFooter>
          {sale && (
            <>
              <Button variant="outline" onClick={() => printSale(sale, 'thermal')}>
                <Printer className="h-4 w-4" /> Receipt
              </Button>
              <Button variant="outline" onClick={() => printSale(sale, 'a4')}>
                <FileDown className="h-4 w-4" /> Export PDF
              </Button>
              <Button variant="outline" loading={emailReceipt.isPending} onClick={() => emailReceipt.mutate()}>
                <Mail className="h-4 w-4" /> Email
              </Button>
            </>
          )}
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

function SaleStat({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        </div>
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', tone)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function RowMenu({
  onPrint,
  onEmail,
}: {
  onPrint: () => void;
  onEmail: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onBlur={() => setTimeout(() => setOpen(false), 120)}>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Receipt actions"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
      >
        <MoreVertical className="h-4 w-4" />
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-border bg-popover p-1 shadow-lg animate-fade-in">
          <button
            onClick={() => { setOpen(false); onPrint(); }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
          >
            <Printer className="h-4 w-4" /> Print receipt
          </button>
          <button
            onClick={() => { setOpen(false); onEmail(); }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
          >
            <Mail className="h-4 w-4" /> Email receipt
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * How much of a line can still go back. `quantity` and `returnedQty` are
 * Decimal(12,3) strings, so coerce before subtracting; rounding keeps the
 * float artefacts out of the qty input's max.
 */
function remainingOf(it: SaleItem) {
  return Math.max(
    0,
    Math.round((Number(it.quantity) - Number(it.returnedQty)) * 1000) / 1000,
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
  const returnable = sale.items.filter((it) => remainingOf(it) > 0);
  if (returnable.length === 0) return null;
  return (
    <details className="rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">Return items</summary>
      <div className="mt-3 space-y-2">
        {returnable.map((it) => {
          const max = remainingOf(it);
          return (
            <div key={it.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate">{it.name}</span>
              <span className="text-xs text-muted-foreground">max {max}</span>
              <Input type="number" step="0.001" min="0" max={max} className="h-8 w-20"
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