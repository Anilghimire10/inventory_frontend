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
  Download,
} from 'lucide-react';
import { SalesApi } from '@/api';
import { useStoreLabel } from '@/components/StorePicker';
import { ALL_STORES, useStoreScope } from '@/store/StoreContext';
import type { PaymentMethod, ReturnQuote, Sale, SaleListItem, SettleMethod } from '@/types';

/** Why a returned line is written off instead of going back on the shelf. */
type WriteOffReason = 'DAMAGE' | 'EXPIRED';
import { PageHeader, LoadingBlock, EmptyState, ErrorState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { TillPicker, useTillChoice } from '@/components/TillPicker';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { useToast } from '@/components/ui/toast';
import { apiError, apiErrorCode } from '@/lib/api';
import { liveRefetchInterval } from '@/lib/live';
import { printReturnSlip, printSale, type ReturnSlip } from '@/lib/print';
import { formatMoney, formatDateTime } from '@/lib/format';
import { remainingQty } from '@/lib/decimal';
import { Card } from '@/components/ui/card';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { exportCsv } from '@/lib/csv';
import { useAuth } from '@/auth/AuthContext';
import { useAcceptedTenders } from '@/hooks/useAcceptedTenders';
import { can } from '@/lib/permissions';

/** The accountant's sales file: one row per bill. */
const SALES_EXPORT_COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'receiptNo', label: 'Receipt' },
  { key: 'store', label: 'Branch' },
  { key: 'cashier', label: 'Cashier' },
  { key: 'customer', label: 'Customer' },
  { key: 'customerPhone', label: 'Customer phone' },
  { key: 'items', label: 'Items' },
  { key: 'units', label: 'Units' },
  { key: 'subtotal', label: 'Subtotal' },
  { key: 'discount', label: 'Discount' },
  { key: 'tax', label: 'Tax' },
  { key: 'total', label: 'Total' },
  { key: 'refunded', label: 'Refunded' },
  { key: 'netTotal', label: 'Net total' },
  { key: 'paid', label: 'Paid' },
  { key: 'due', label: 'Still owed' },
  { key: 'paymentMethod', label: 'Payment' },
  { key: 'status', label: 'Status' },
  { key: 'prescriptionRef', label: 'Prescription ref.' },
];

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
  KHALTI: 'Khalti',
  CONNECTIPS: 'connectIPS',
  CREDIT: 'Credit',
  // Part paid now (by any tender -- the payment row records which), the rest
  // on the customer's khata. Not "Cash + Credit": a card part-payment is MIXED too.
  MIXED: 'Part credit',
};

// Whole calendar days back from today, inclusive — the same convention the
// Analytics range presets use, so "Last 7 days" means the same span on both
// screens. The previous rolling millisecond cutoffs made "Today" reach back
// into yesterday evening.
const DAYS_BACK: Record<Exclude<DateFilter, 'all'>, number> = {
  today: 0,
  '7d': 6,
  '30d': 29,
};

const DATE_LABEL: Record<DateFilter, string> = {
  all: 'all time',
  today: 'today',
  '7d': 'last 7 days',
  '30d': 'last 30 days',
};

/** Inclusive start-of-day / end-of-day bounds for a preset. */
function dateRange(filter: DateFilter): { from?: string; to?: string } {
  if (filter === 'all') return {};
  const start = new Date();
  start.setDate(start.getDate() - DAYS_BACK[filter]);
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

/**
 * Whether goods can come back against this sale. Not once it is fully
 * returned, and never for a held cart: it isn't a sale yet, so nothing left
 * the shelf and nothing was paid. Resume or discard it instead.
 */
const canReturn = (s: { status: SaleListItem['status'] }) =>
  s.status === 'COMPLETED' || s.status === 'PARTIALLY_RETURNED';

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
  const { user } = useAuth();
  const canExport = !!user && can.viewFinancials(user.role);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [payFilter, setPayFilter] = useState<'all' | PaymentMethod>('all');
  // App-wide selection: switching in the header moves this page too.
  const { storeId } = useStoreScope();
  // A branch switch can land you past the end of the new result set. Adjusted
  // during render (React's documented pattern) rather than in an effect.
  const [prevStore, setPrevStore] = useState(storeId);
  if (prevStore !== storeId) {
    setPrevStore(storeId);
    setPage(1);
  }
  const [openId, setOpenId] = useState<string | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  // null = the tender the sale was paid on, which the quote reports.
  const [refundMethod, setRefundMethod] = useState<SettleMethod | null>(null);
  // Lines coming back unfit to sell, and why: written off rather than
  // restocked. A line with no entry goes back on the shelf.
  const [writeOff, setWriteOff] = useState<Record<string, WriteOffReason>>({});
  const [returnReason, setReturnReason] = useState('');
  // Serialised lines: which units are coming back, by serial number.
  const [pickedSerials, setPickedSerials] = useState<Record<string, string[]>>({});
  // The return just made, kept so its slip can be printed.
  const [lastReturn, setLastReturn] = useState<ReturnSlip | null>(null);
  const resetReturn = () => {
    setReturnQty({});
    setRefundMethod(null);
    setWriteOff({});
    setReturnReason('');
    setPickedSerials({});
  };
  const returnLines = Object.entries(returnQty)
    .filter(([, q]) => q > 0)
    .map(([saleItemId, quantity]) => ({ saleItemId, quantity }));
  const storeLabel = useStoreLabel(storeId);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['sales', page, search, dateFilter, statusFilter, payFilter, storeId],
    queryFn: () =>
      SalesApi.list({
        page,
        limit: 20,
        search: search || undefined,
        ...dateRange(dateFilter),
        status: statusFilter === 'all' ? undefined : statusFilter,
        paymentMethod: payFilter === 'all' ? undefined : payFilter,
        storeId: storeId || undefined,
      }),
    refetchInterval: liveRefetchInterval,
  });
  const detail = useQuery({
    queryKey: ['sale', openId],
    queryFn: () => SalesApi.get(openId!),
    enabled: !!openId,
  });

  const sales = data?.data ?? [];

  // What the return would hand back, from the same calculation the return
  // itself runs -- so the cashier sees the amount before confirming, not
  // after the money has already gone.
  const quote = useQuery({
    queryKey: ['return-quote', openId, returnLines],
    queryFn: () => SalesApi.returnQuote(openId!, returnLines),
    enabled: !!openId && returnLines.length > 0,
  });

  const doReturn = useMutation({
    mutationFn: (shiftId: string | null) =>
      SalesApi.return(openId!, {
        // The till the cash comes out of, when several are open and this
        // owner or manager has none of their own (see useTillChoice).
        ...(shiftId ? { shiftId } : {}),
        items: returnLines.map((l) => ({
          ...l,
          ...(writeOff[l.saleItemId] ? { writeOffReason: writeOff[l.saleItemId] } : {}),
          ...(pickedSerials[l.saleItemId]?.length ? { serials: pickedSerials[l.saleItemId] } : {}),
        })),
        ...(refundMethod ? { refundMethod } : {}),
        ...(returnReason.trim() ? { reason: returnReason.trim() } : {}),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['sale', openId] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['return-quote', openId] });
      const parts = [
        res.cashBack > 0 && `${formatMoney(res.cashBack)} back in ${PAYMENT_LABEL[res.method ?? 'CASH'].toLowerCase()}`,
        res.creditCancelled > 0 && `${formatMoney(res.creditCancelled)} off their balance`,
      ].filter(Boolean);
      show(`Returned — ${parts.length ? parts.join(', ') : 'nothing to refund'}`);
      const names = new Map(sale?.items.map((it) => [it.id, it.name]));
      setLastReturn({
        result: res,
        reason: returnReason.trim() || undefined,
        lines: returnLines.map((l) => ({
          name: names.get(l.saleItemId) ?? 'Item',
          quantity: l.quantity,
          writtenOff: writeOff[l.saleItemId],
          serials: pickedSerials[l.saleItemId],
        })),
      });
      resetReturn();
    },
    onError: (e) => {
      show(apiError(e), 'error');
      // A till opened since the picker loaded made the choice ambiguous:
      // reload the list so the picker can ask.
      if (apiErrorCode(e) === 'TILL_CHOICE') qc.invalidateQueries({ queryKey: ['shift-open'] });
    },
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
  // A cash refund by an owner or manager with no till of their own, while
  // several are open at the sale's store: which drawer the cash comes out of
  // is theirs to say. Booked to none, that drawer would count short at close.
  const till = useTillChoice(
    sale?.store?.id ?? '',
    refundMethod ?? quote.data?.defaultMethod ?? 'CASH',
    returnLines.length > 0 && (quote.data?.cashBack ?? 0) > 0,
  );
  const hasFilters =
    search !== '' ||
    dateFilter !== 'all' ||
    statusFilter !== 'all' ||
    payFilter !== 'all' ||
    storeId !== ALL_STORES;

  // `revenue` and `revenueCount` follow the date, store, payment and search
  // filters, and always exclude returned and held sales — so the cards track
  // the list instead of being pinned to today. The status filter is the one
  // exception: the server holds revenue steady across it on purpose, so that
  // picking "Held" can't make revenue jump. Say so when one is set, otherwise
  // the figures look unrelated to the two rows on screen.
  // The bills the filters on screen match, all of them -- not just this page.
  const exportSales = async () => {
    setExporting(true);
    try {
      const res = await SalesApi.exportRows({
        search: search || undefined,
        ...dateRange(dateFilter),
        status: statusFilter === 'all' ? undefined : statusFilter,
        paymentMethod: payFilter === 'all' ? undefined : payFilter,
        storeId: storeId || undefined,
      });
      if (!res.rows.length) {
        show('No sales match these filters', 'error');
        return;
      }
      await exportCsv(`sales_${dateFilter}_${new Date().toISOString().slice(0, 10)}`, SALES_EXPORT_COLUMNS, res.rows);
      show(
        res.truncated
          ? `Saved the first ${res.rows.length.toLocaleString()} of ${res.total.toLocaleString()} bills. Pick a shorter date range for the rest.`
          : `Saved ${res.rows.length.toLocaleString()} bills`,
        res.truncated ? 'error' : 'success',
      );
    } catch (e) {
      show(apiError(e), 'error');
    } finally {
      setExporting(false);
    }
  };

  const revenue = data?.meta.revenue ?? 0;
  const revenueCount = data?.meta.revenueCount ?? 0;
  const summaryLabel = storeLabel && storeLabel !== 'all stores'
    ? `${DATE_LABEL[dateFilter]}, ${storeLabel}`
    : DATE_LABEL[dateFilter];
  const statusNote = statusFilter === 'all' ? '' : ', all statuses';

  return (
    <div>
      <PageHeader
        title="Sales"
        description="Transaction history and returns."
        action={
          canExport && (
            <Button variant="outline" loading={exporting} onClick={exportSales}>
              <Download className="h-4 w-4" /> Export
            </Button>
          )
        }
      />

      {/* Summary cards — the completed sales the current filters match */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SaleStat
          label="Sales"
          value={formatMoney(revenue)}
          sub={`Completed sales, ${summaryLabel}${statusNote}`}
          icon={Banknote}
          tone="bg-primary/10 text-primary"
        />
        <SaleStat
          label="Transactions"
          value={String(revenueCount)}
          sub={`Receipts, ${summaryLabel}${statusNote}`}
          icon={Receipt}
          tone="bg-primary/10 text-primary"
        />
        <SaleStat
          label="Average Sale"
          value={formatMoney(revenueCount > 0 ? revenue / revenueCount : 0)}
          sub="Per completed sale"
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
          <Select value={dateFilter}
            onChange={(e) => { setDateFilter(e.target.value as DateFilter); setPage(1); }}>
            <option value="all">All dates</option>
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </Select>
        </div>
        <div className="w-full sm:w-36">
          <Select value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as StatusFilter); setPage(1); }}>
            <option value="all">All statuses</option>
            <option value="paid">Paid</option>
            <option value="due">Due</option>
            <option value="partial">Partial</option>
            <option value="return">Return</option>
            <option value="held">Held</option>
          </Select>
        </div>
        <div className="w-full sm:w-40">
          <Select value={payFilter}
            onChange={(e) => { setPayFilter(e.target.value as 'all' | PaymentMethod); setPage(1); }}>
            <option value="all">All payments</option>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="MOBILE">Mobile</option>
            <option value="KHALTI">Khalti</option>
            <option value="CONNECTIPS">connectIPS</option>
            <option value="CREDIT">Credit</option>
            <option value="MIXED">Part credit</option>
          </Select>
        </div>
      </div>

      {isError ? <ErrorState onRetry={() => refetch()} /> :
        isLoading ? <LoadingBlock /> :
        !data || data.data.length === 0 ? (
          hasFilters ? (
            <EmptyState title="No sales match your filters" description="Try widening your date, status, payment, or store filters." icon={Search} />
          ) : (
            <EmptyState title="No sales yet" description="Completed sales will show up here." icon={Receipt} />
          )
        ) : (
          <>
            <Table>
              <THead><TR><TH>Receipt</TH><TH className="hidden sm:table-cell">When</TH><TH className="hidden md:table-cell">Customer</TH><TH className="hidden md:table-cell">Payment</TH><TH className="hidden sm:table-cell">Status</TH><TH className="text-right">Total</TH><TH /></TR></THead>
              <TBody>
                {sales.map((s) => {
                  const v = viewStatus(s);
                  return (
                    <TR key={s.id} className="cursor-pointer" onClick={() => { setOpenId(s.id); resetReturn(); setLastReturn(null); }}>
                      <TD className="font-medium">
                        {s.receiptNo}
                        {/* Phones hide the When and Status columns; they ride along with the receipt. */}
                        <div className="text-xs font-normal text-muted-foreground sm:hidden">{formatDateTime(s.createdAt)}</div>
                        <Badge tone={v.tone} className="mt-1 gap-1 sm:hidden">
                          {v.paid && <Check className="h-3 w-3" />}
                          {v.label}
                        </Badge>
                      </TD>
                      <TD className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">{formatDateTime(s.createdAt)}</TD>
                      <TD className="hidden md:table-cell">{s.customer?.name ?? 'Walk-in'}</TD>
                      <TD className="hidden text-muted-foreground md:table-cell">{PAYMENT_LABEL[s.paymentMethod ?? 'CASH']}</TD>
                      <TD className="hidden sm:table-cell">
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
                      {(sale.serials ?? []).some((u) => u.productId === it.productId) && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(sale.serials ?? [])
                            .filter((u) => u.productId === it.productId)
                            .map((u) => (
                              <span
                                key={u.serialNumber}
                                title={u.status === 'SOLD' ? 'Sold' : 'Returned'}
                                className={cn(
                                  'rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]',
                                  u.status !== 'SOLD' && 'text-muted-foreground line-through',
                                )}
                              >
                                {u.serialNumber}
                              </span>
                            ))}
                        </div>
                      )}
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
                <div className="flex justify-between text-muted-foreground"><span>{sale.taxInclusive ? 'Tax (included)' : 'Tax'}</span><span>{formatMoney(sale.tax)}</span></div>
                <div className="flex justify-between border-t border-border pt-1 text-base font-semibold"><span>Total</span><span>{formatMoney(sale.total)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Paid</span><span>{formatMoney(sale.amountPaid)}</span></div>
                {due > 0 && <div className="flex justify-between font-medium text-destructive"><span>Balance due</span><span>{formatMoney(due)}</span></div>}
              </div>
            </div>

            {lastReturn && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-success/30 bg-success/10 p-3 text-sm">
                <span>
                  Return done — {formatMoney(lastReturn.result.cashBack)} handed back
                  {lastReturn.result.creditCancelled > 0 && `, ${formatMoney(lastReturn.result.creditCancelled)} off what they owe`}.
                </span>
                <Button size="sm" variant="outline" onClick={() => printReturnSlip(sale, lastReturn)}>
                  <Printer className="h-4 w-4" /> Print return slip
                </Button>
              </div>
            )}

            {canReturn(sale) && (
              <ReturnSection
                sale={sale}
                returnQty={returnQty}
                setReturnQty={setReturnQty}
                quote={returnLines.length > 0 ? quote.data : undefined}
                quoteError={returnLines.length > 0 && quote.isError ? apiError(quote.error) : null}
                refundMethod={refundMethod}
                setRefundMethod={setRefundMethod}
                writeOff={writeOff}
                setWriteOff={setWriteOff}
                pickedSerials={pickedSerials}
                setPickedSerials={setPickedSerials}
                reason={returnReason}
                setReason={setReturnReason}
                till={till}
              />
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
          {sale && canReturn(sale) && (
            <Button
              variant="destructive"
              disabled={returnLines.length === 0 || quote.isError || (till.needsChoice && !till.shiftId)}
              loading={doReturn.isPending}
              onClick={() => doReturn.mutate(till.shiftId)}
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
      <Tooltip content="Receipt actions">
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
      </Tooltip>
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

function ReturnSection({
  sale,
  returnQty,
  setReturnQty,
  quote,
  quoteError,
  refundMethod,
  setRefundMethod,
  writeOff,
  setWriteOff,
  pickedSerials,
  setPickedSerials,
  reason,
  setReason,
  till,
}: {
  sale: Sale;
  returnQty: Record<string, number>;
  setReturnQty: (v: Record<string, number>) => void;
  quote?: ReturnQuote;
  quoteError: string | null;
  refundMethod: SettleMethod | null;
  setRefundMethod: (m: SettleMethod | null) => void;
  writeOff: Record<string, WriteOffReason>;
  setWriteOff: (v: Record<string, WriteOffReason>) => void;
  pickedSerials: Record<string, string[]>;
  setPickedSerials: (v: Record<string, string[]>) => void;
  reason: string;
  setReason: (v: string) => void;
  till: ReturnType<typeof useTillChoice>;
}) {
  const returnable = sale.items.filter((it) => remainingQty(it) > 0);
  // The shop's tenders, plus the one the sale was paid on (the default).
  const refundTenders = useAcceptedTenders(quote?.defaultMethod);
  if (returnable.length === 0) return null;
  return (
    <details className="rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">Return items</summary>
      <div className="mt-3 space-y-2">
        {returnable.map((it) => {
          const max = remainingQty(it);
          // Serialised goods come back as specific units: pick them by
          // serial rather than letting the server assume the oldest ones.
          const units = (sale.serials ?? []).filter(
            (u) => u.productId === it.productId && u.status === 'SOLD',
          );
          const picked = pickedSerials[it.id] ?? [];
          const toggle = (serial: string, on: boolean) => {
            const next = on ? [...picked, serial] : picked.filter((x) => x !== serial);
            setPickedSerials({ ...pickedSerials, [it.id]: next });
            setReturnQty({ ...returnQty, [it.id]: next.length });
          };
          return (
            <div key={it.id} className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">{it.name}</span>
                <span className="text-xs text-muted-foreground">max {max}</span>
                {units.length > 0 ? (
                  <span className="w-20 text-right tabular-nums">{picked.length}</span>
                ) : (
                  <Input type="number" step="0.001" min="0" max={max} className="h-8 w-20"
                    aria-label={`How many ${it.name} to return`}
                    value={returnQty[it.id] ?? 0}
                    onChange={(e) =>
                      setReturnQty({ ...returnQty, [it.id]: Math.min(max, Math.max(0, Number(e.target.value))) })
                    } />
                )}
                <Tooltip content="Unfit to sell: refunded, but written off instead of going back on the shelf. Expired goods are reported as expired, not damaged.">
                  <Select
                    className="h-8 w-32 text-xs"
                    aria-label={`What happens to the returned ${it.name}`}
                    value={writeOff[it.id] ?? ''}
                    onChange={(e) => {
                      const next = { ...writeOff };
                      if (e.target.value) next[it.id] = e.target.value as WriteOffReason;
                      else delete next[it.id];
                      setWriteOff(next);
                    }}
                  >
                    <option value="">Back on shelf</option>
                    <option value="DAMAGE">Damaged</option>
                    <option value="EXPIRED">Expired</option>
                  </Select>
                </Tooltip>
              </div>
              {units.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 pl-1 text-xs">
                  {units.map((u) => (
                    <label key={u.serialNumber} className="flex items-center gap-1 font-mono">
                      <input
                        type="checkbox"
                        checked={picked.includes(u.serialNumber)}
                        disabled={!picked.includes(u.serialNumber) && picked.length >= max}
                        onChange={(e) => toggle(u.serialNumber, e.target.checked)}
                      />
                      {u.serialNumber}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <Input
          className="h-8"
          placeholder="Reason (optional), e.g. wrong size"
          aria-label="Reason for return"
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      {quoteError && <p className="mt-3 text-sm text-destructive">{quoteError}</p>}
      {quote && (
        <div className="mt-3 space-y-1 rounded-md bg-muted/50 p-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Value of goods returned</span>
            <span>{formatMoney(quote.refund)}</span>
          </div>
          {quote.creditCancelled > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Taken off what they owe</span>
              <span>- {formatMoney(quote.creditCancelled)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-1 font-semibold">
            <span>Hand back</span>
            <span>{formatMoney(quote.cashBack)}</span>
          </div>
          {quote.cashBack > 0 && (
            <label className="flex items-center justify-between gap-2 pt-1">
              <span className="text-muted-foreground">Refund as</span>
              <Select
                className="h-8 w-32"
                value={refundMethod ?? quote.defaultMethod}
                onChange={(e) => setRefundMethod(e.target.value as SettleMethod)}
              >
                {refundTenders.map((m) => (
                  <option key={m.value} value={m.value}>
                    {PAYMENT_LABEL[m.value]}
                  </option>
                ))}
              </Select>
            </label>
          )}
          {quote.cashBack > 0 && till.needsChoice && (
            <div className="pt-1">
              <TillPicker choice={till} label="Cash comes out of" />
            </div>
          )}
        </div>
      )}
    </details>
  );
}