'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Scale,
  ChevronDown,
  Wallet,
  HandCoins,
  Search,
  Undo2,
} from 'lucide-react';
import { CreditApi, CustomersApi, PurchasesApi, ReportsApi } from '@/api';
import { useStoreScope } from '@/store/StoreContext';
import type { CreditInvoice, Payable, PaymentMethod, Receivable, SupplierRefund } from '@/types';
import { PageHeader, LoadingBlock, EmptyState, ErrorState } from '@/components/ui/misc';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { Hint } from '@/components/ui/tooltip';
import { apiError } from '@/lib/api';
import { formatMoney, formatDate, plural } from '@/lib/format';
import { useAcceptedTenders } from '@/hooks/useAcceptedTenders';
import { TillPicker, useTillChoice } from '@/components/TillPicker';
import { cn } from '@/lib/utils';
import { Tabs } from '@/components/ui/tabs';

type Tab = 'receivables' | 'payables' | 'refunds';

// What the payment dialog is settling.
type PayTarget =
  | { kind: 'customer'; id: string; name: string; max: number }
  | { kind: 'purchase'; id: string; name: string; max: number }
  // A supplier paying back what they owe on goods returned to them.
  | { kind: 'refund'; id: string; name: string; max: number };

export default function CreditPage() {
  const qc = useQueryClient();
  const { show } = useToast();
  const [tab, setTab] = useState<Tab>('receivables');
  const [query, setQuery] = useState('');
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null);

  // Follows the branch chosen in the header. Payables scope exactly;
  // receivable balances stay business-wide (see the note by the tile).
  const { storeId } = useStoreScope();
  const summary = useQuery({
    queryKey: ['credit', 'summary', storeId],
    queryFn: () => CreditApi.summary(storeId || undefined),
  });
  // How old the receivables are. Keyed under 'credit' so recording a payment
  // re-ages the book along with everything else on this page.
  const ageing = useQuery({
    queryKey: ['credit', 'ageing', storeId],
    queryFn: () => ReportsApi.creditAgeing(storeId || undefined),
  });
  const receivables = useQuery({
    queryKey: ['credit', 'receivables', storeId],
    queryFn: () => CreditApi.receivables(storeId || undefined),
    enabled: tab === 'receivables',
  });
  const payables = useQuery({
    queryKey: ['credit', 'payables', storeId],
    queryFn: () => CreditApi.payables(storeId || undefined),
    enabled: tab === 'payables',
  });

  const refunds = useQuery({
    queryKey: ['credit', 'supplier-refunds', storeId],
    queryFn: () => CreditApi.supplierRefunds(storeId || undefined),
    enabled: tab === 'refunds',
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['credit'] });
    qc.invalidateQueries({ queryKey: ['purchases'] });
  };

  const pay = useMutation({
    mutationFn: ({
      target,
      amount,
      method,
      shiftId,
    }: {
      target: PayTarget;
      amount: number;
      method: PaymentMethod;
      shiftId: string | null;
    }): Promise<unknown> =>
      target.kind === 'customer'
        ? // The branch in the header is where the money was taken, so cash
          // collected here lands in that branch's open till.
          CustomersApi.payCredit(target.id, amount, {
            method,
            storeId: storeId || undefined,
            shiftId: shiftId ?? undefined,
          })
        : target.kind === 'refund'
          ? PurchasesApi.refundReceived(target.id, amount, { method })
          : PurchasesApi.pay(target.id, amount, { method }),
    onSuccess: (_res, { target }) => {
      show(target.kind === 'refund' ? 'Refund recorded' : 'Payment recorded');
      refresh();
      setPayTarget(null);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const q = query.trim().toLowerCase();
  const filteredReceivables = (receivables.data ?? []).filter(
    (r) => !q || r.name.toLowerCase().includes(q),
  );
  const filteredPayables = (payables.data ?? []).filter(
    (p) => !q || p.name.toLowerCase().includes(q),
  );
  const filteredRefunds = (refunds.data ?? []).filter(
    (r) => !q || r.name.toLowerCase().includes(q),
  );
  const refundsDue = summary.data?.supplierRefundsDue ?? 0;
  const netPosition = summary.data?.netPosition ?? 0;

  const receivablesTotal = summary.data?.receivablesTotal ?? 0;
  // Payables scope exactly to a branch; receivable balances cannot, because a
  // customer's debt is to the business, whichever branch took the payment.
  const businessWide = !!summary.data?.receivablesAreBusinessWide;
  const payablesTotal = summary.data?.payablesTotal ?? 0;

  return (
    <div>
      <PageHeader
        title="Credit"
        description="Track what customers owe you and what you owe suppliers."
      />

      {businessWide && (
        <p className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Showing one store. Payables are that store&apos;s. Receivables list the
          customers who buy there, each with the <strong>full</strong> balance
          they owe the business — a customer&apos;s debt isn&apos;t split
          between branches.
        </p>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Receivables"
          hint="Money customers owe you (udhaaro) from sales on credit."
          value={formatMoney(receivablesTotal)}
          sub={
            businessWide
              ? `${plural(summary.data?.customersOwing, 'customer')} who buy here — full balances`
              : `${plural(summary.data?.customersOwing, 'customer')} ${summary.data?.customersOwing === 1 ? 'owes' : 'owe'} you`
          }
          icon={ArrowDownLeft}
          tone="success"
        />
        <SummaryCard
          label="Payables"
          hint="Money you owe suppliers for purchases not yet paid in full."
          value={formatMoney(payablesTotal)}
          sub={
            refundsDue > 0
              ? `${plural(summary.data?.suppliersOwed, 'supplier')} to pay · ${formatMoney(refundsDue)} owed back to you`
              : `${plural(summary.data?.suppliersOwed, 'supplier')} to pay`
          }
          icon={ArrowUpRight}
          tone="destructive"
        />
        {/* Net, not a sum: adding what you owe to what you're owed made a
            total that described nothing. */}
        <SummaryCard
          label="Net position"
          hint="What customers (and suppliers, on returns) owe you, less what you owe suppliers."
          value={formatMoney(Math.abs(netPosition))}
          sub={
            netPosition > 0
              ? 'more owed to you than you owe'
              : netPosition < 0
                ? 'you owe more than you are owed'
                : 'evenly balanced'
          }
          icon={Scale}
          tone={netPosition < 0 ? 'destructive' : 'success'}
        />
      </div>

      {/* How old the receivables are. A total says how much is out there;
          this says how long it has been out there, which is the part that
          decides who to call. */}
      {ageing.data && ageing.data.total > 0 && (
        <Card className="mt-4 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium">
              <Hint tip="Each balance is placed by how long ago its oldest unpaid credit sale was made. Over 30 days is overdue.">
                Receivables by age
              </Hint>
            </h2>
            {ageing.data.overdue > 0 && (
              <p className="text-xs text-warning">
                {formatMoney(ageing.data.overdue)} has been owed for over 30 days
              </p>
            )}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <AgeBucket
              label="0–30 days"
              value={ageing.data.buckets.current}
              total={ageing.data.total}
              tone="bg-success"
            />
            <AgeBucket
              label="30–60 days"
              value={ageing.data.buckets.days30}
              total={ageing.data.total}
              tone="bg-warning"
            />
            <AgeBucket
              label="Over 60 days"
              value={ageing.data.buckets.days60Plus}
              total={ageing.data.total}
              tone="bg-destructive"
            />
          </div>
          {ageing.data.unattributed > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {formatMoney(ageing.data.unattributed)} can&apos;t be aged — it isn&apos;t
              backed by a credit sale (an opening balance or a manual adjustment), so
              there&apos;s no date to measure from.
            </p>
          )}
          {ageing.data.topDebtors.length > 0 && (
            <div className="mt-5">
              <h3 className="text-xs font-medium text-muted-foreground">
                Largest balances
              </h3>
              <ul className="mt-2 divide-y divide-border">
                {ageing.data.topDebtors.slice(0, 5).map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="truncate text-sm">{d.name}</span>
                    <span className="flex shrink-0 items-center gap-3">
                      {d.oldestUnpaidDays !== null && (
                        <span
                          className={cn(
                            'text-xs',
                            d.oldestUnpaidDays > 60
                              ? 'text-destructive'
                              : d.oldestUnpaidDays > 30
                                ? 'text-warning'
                                : 'text-muted-foreground',
                          )}
                        >
                          oldest {d.oldestUnpaidDays}d
                        </span>
                      )}
                      <span className="text-sm font-medium tabular-nums">
                        {formatMoney(d.balance)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* Tabs + search */}
      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <Tabs
          className="min-w-0 flex-1"
          label="Who owes whom"
          items={[
            { id: 'receivables', label: 'Receivables', icon: Wallet },
            { id: 'payables', label: 'Payables', icon: HandCoins },
            { id: 'refunds', label: 'Supplier refunds', icon: Undo2 },
          ]}
          value={tab}
          onChange={setTab}
        />
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            aria-label={tab === 'receivables' ? 'Search customer' : 'Search supplier'}
            placeholder={tab === 'receivables' ? 'Search customer…' : 'Search supplier…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-4">
        {tab === 'refunds' ? (
          refunds.isError ? (
            <ErrorState onRetry={() => refunds.refetch()} />
          ) : refunds.isLoading ? (
            <LoadingBlock />
          ) : !refunds.data || refunds.data.length === 0 ? (
            <EmptyState
              title="No supplier refunds owed"
              description="When you return paid-for goods to a supplier, what they owe you back shows up here until they pay it."
              icon={Undo2}
            />
          ) : filteredRefunds.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No supplier matches your search.</p>
          ) : (
            <div className="space-y-3">
              {filteredRefunds.map((r) => (
                <SupplierRefundCard
                  key={r.id ?? 'none'}
                  r={r}
                  onReceive={(p) =>
                    setPayTarget({
                      kind: 'refund',
                      id: p.id,
                      name: `${r.name} · ${p.reference ?? p.id.slice(0, 6)}`,
                      max: p.refundDue,
                    })
                  }
                />
              ))}
            </div>
          )
        ) : tab === 'receivables' ? (
          receivables.isError ? (
            <ErrorState onRetry={() => receivables.refetch()} />
          ) : receivables.isLoading ? (
            <LoadingBlock />
          ) : !receivables.data || receivables.data.length === 0 ? (
            <EmptyState
              title="No outstanding receivables"
              description="Credit sales that haven't been fully repaid will show up here."
              icon={Wallet}
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Customer</TH>
                  <TH className="text-right">Invoices</TH>
                  <TH className="text-right">Total</TH>
                  <TH className="text-right">Paid</TH>
                  <TH className="text-right">Outstanding</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {filteredReceivables.length === 0 ? (
                  <TR>
                    <TD colSpan={6} className="py-8 text-center text-muted-foreground">
                      No customer matches your search.
                    </TD>
                  </TR>
                ) : (
                  filteredReceivables.map((r) => (
                    <ReceivableRow
                      key={r.id}
                      r={r}
                      onPay={() =>
                        setPayTarget({ kind: 'customer', id: r.id, name: r.name, max: r.balance })
                      }
                    />
                  ))
                )}
              </TBody>
            </Table>
          )
        ) : payables.isError ? (
          <ErrorState onRetry={() => payables.refetch()} />
        ) : payables.isLoading ? (
          <LoadingBlock />
        ) : !payables.data || payables.data.length === 0 ? (
          <EmptyState
            title="No outstanding payables"
            description="Purchases bought on credit will show up here until you've paid them."
            icon={HandCoins}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Supplier</TH>
                <TH className="text-right">Invoices</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Paid</TH>
                <TH className="text-right">Outstanding</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {filteredPayables.length === 0 ? (
                <TR>
                  <TD colSpan={6} className="py-8 text-center text-muted-foreground">
                    No supplier matches your search.
                  </TD>
                </TR>
              ) : (
                filteredPayables.map((p) => (
                  <PayableRow
                    key={p.id ?? 'none'}
                    p={p}
                    onPayInvoice={(inv) =>
                      setPayTarget({
                        kind: 'purchase',
                        id: inv.id,
                        name: `${p.name} · ${inv.reference ?? inv.id.slice(0, 6)}`,
                        max: inv.outstanding ?? inv.total - inv.amountPaid,
                      })
                    }
                  />
                ))
              )}
            </TBody>
          </Table>
        )}
      </div>

      {payTarget && (
        <PayDialog
          target={payTarget}
          loading={pay.isPending}
          onClose={() => setPayTarget(null)}
          storeId={storeId}
          onSubmit={(amount, method, shiftId) => pay.mutate({ target: payTarget, amount, method, shiftId })}
        />
      )}
    </div>
  );
}

function ReceivableRow({ r, onPay }: { r: Receivable; onPay: () => void }) {
  const [open, setOpen] = useState(false);
  const total = r.invoices.reduce((s, i) => s + Number(i.total), 0);
  const paid = r.invoices.reduce((s, i) => s + Number(i.amountPaid), 0);
  return (
    <>
      <TR>
        <TD>
          <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-left">
            <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
            <span className="font-medium">{r.name}</span>
            {r.phone && <span className="text-xs text-muted-foreground">{r.phone}</span>}
          </button>
        </TD>
        <TD className="text-right tabular-nums">{r.invoices.length}</TD>
        <TD className="text-right tabular-nums">{formatMoney(total)}</TD>
        <TD className="text-right tabular-nums text-muted-foreground">{formatMoney(paid)}</TD>
        <TD className="text-right">
          <span
            className={cn(
              'font-semibold tabular-nums',
              r.balance > 0 ? 'text-success' : 'text-muted-foreground',
            )}
          >
            {formatMoney(r.balance)}
          </span>
        </TD>
        <TD>
          <div className="flex justify-end">
            {r.balance > 0 ? (
              <Button size="sm" onClick={onPay}>Record payment</Button>
            ) : (
              <Badge tone="muted">Paid</Badge>
            )}
          </div>
        </TD>
      </TR>
      {open && (
        <TR>
          <TD colSpan={6} className="bg-muted/30 p-3">
            <InvoiceCards invoices={r.invoices} tone="success" />
          </TD>
        </TR>
      )}
    </>
  );
}

function SupplierRefundCard({
  r,
  onReceive,
}: {
  r: SupplierRefund;
  onReceive: (p: SupplierRefund['purchases'][number]) => void;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{r.name}</span>
        <span className="font-semibold tabular-nums text-success">
          owes you {formatMoney(r.due)}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {r.purchases.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{p.reference ?? p.id.slice(0, 8)}</div>
              <div className="text-xs text-muted-foreground">{formatDate(p.createdAt)}</div>
            </div>
            <span className="tabular-nums">{formatMoney(p.refundDue)}</span>
            <Button size="sm" variant="outline" onClick={() => onReceive(p)}>
              Record received
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PayableRow({
  p,
  onPayInvoice,
}: {
  p: Payable;
  onPayInvoice: (inv: CreditInvoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const total = p.invoices.reduce((s, i) => s + Number(i.total), 0);
  const paid = p.invoices.reduce((s, i) => s + Number(i.amountPaid), 0);
  const outstandingInvoices = p.invoices.filter(
    (inv) => (inv.outstanding ?? inv.total - inv.amountPaid) > 0,
  );
  const single = outstandingInvoices.length === 1 ? outstandingInvoices[0] : null;
  return (
    <>
      <TR>
        <TD>
          <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-left">
            <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
            <span className="font-medium">{p.name}</span>
          </button>
        </TD>
        <TD className="text-right tabular-nums">{p.invoices.length}</TD>
        <TD className="text-right tabular-nums">{formatMoney(total)}</TD>
        <TD className="text-right tabular-nums text-muted-foreground">{formatMoney(paid)}</TD>
        <TD className="text-right">
          <span
            className={cn(
              'font-semibold tabular-nums',
              p.outstanding > 0 ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {formatMoney(p.outstanding)}
          </span>
        </TD>
        <TD>
          <div className="flex justify-end">
            {outstandingInvoices.length === 0 ? (
              <Badge tone="muted">Paid</Badge>
            ) : single ? (
              <Button size="sm" variant="outline" onClick={() => onPayInvoice(single)}>
                Pay
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
                Pay invoices
              </Button>
            )}
          </div>
        </TD>
      </TR>
      {open && (
        <TR>
          <TD colSpan={6} className="bg-muted/30 p-3">
            <InvoiceCards invoices={p.invoices} onPay={onPayInvoice} tone="destructive" />
          </TD>
        </TR>
      )}
    </>
  );
}

function InvoiceCards({
  invoices,
  onPay,
  tone,
}: {
  invoices: CreditInvoice[];
  onPay?: (inv: CreditInvoice) => void;
  tone: 'success' | 'destructive';
}) {
  const outstandingColor = { success: 'text-success', destructive: 'text-destructive' }[tone];
  return (
    <div className="space-y-2">
      {invoices.map((inv) => {
        const outstanding = inv.outstanding ?? inv.total - inv.amountPaid;
        return (
          <div
            key={inv.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-3"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {inv.reference ?? inv.id.slice(0, 8)}
              </div>
              <div className="text-xs text-muted-foreground">{formatDate(inv.createdAt)}</div>
            </div>
            <div className="text-right">
              <div
                className={cn(
                  'font-semibold tabular-nums',
                  outstanding > 0 ? outstandingColor : 'text-muted-foreground',
                )}
              >
                {formatMoney(outstanding)}
              </div>
              <div className="text-xs text-muted-foreground">of {formatMoney(inv.total)}</div>
            </div>
            {onPay && (
              <div className="shrink-0">
                {outstanding > 0 ? (
                  <Button size="sm" variant="outline" onClick={() => onPay(inv)}>
                    Pay
                  </Button>
                ) : (
                  <Badge tone="muted">Paid</Badge>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PayDialog({
  target,
  loading,
  onClose,
  storeId,
  onSubmit,
}: {
  target: PayTarget;
  loading: boolean;
  onClose: () => void;
  storeId: string;
  onSubmit: (amount: number, method: PaymentMethod, shiftId: string | null) => void;
}) {
  const [amount, setAmount] = useState(target.max);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const tenders = useAcceptedTenders();
  // Only customer payments land in a till; a supplier is paid from elsewhere.
  const till = useTillChoice(storeId, method, target.kind === 'customer');
  return (
    <Dialog open onClose={onClose} title={target.kind === 'refund' ? 'Record refund received' : 'Record payment'}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(amount, method, till.shiftId);
        }}
        className="space-y-4"
      >
        <p className="text-sm text-muted-foreground">
          {target.kind === 'purchase' ? 'Payment to' : target.kind === 'refund' ? 'Refund from' : 'Payment from'}{' '}
          <span className="font-medium text-foreground">{target.name}</span>.{' '}
          {target.kind === 'refund' ? 'Owed back' : 'Outstanding'}{' '}
          <span className="font-medium text-foreground">{formatMoney(target.max)}</span>.
        </p>
        <Field label="Amount">
          <Input
            type="number"
            step="0.01"
            min="0.01"
            max={target.max}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            required
            autoFocus
          />
        </Field>
        <Field label="Paid by">
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {tenders.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>
        </Field>
        <TillPicker choice={till} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            loading={loading}
            disabled={amount <= 0 || amount > target.max || (till.needsChoice && !till.shiftId)}
          >
            Record {formatMoney(amount || 0)}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

/** One ageing bucket: the amount, and its share of the book as a bar. */
function AgeBucket({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xs text-muted-foreground tabular-nums">{pct}%</p>
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(value)}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  hint,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  hint?: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'primary' | 'success' | 'destructive' | 'warning';
}) {
  const toneClasses = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/15 text-success',
    destructive: 'bg-destructive/10 text-destructive',
    warning: 'bg-warning/15 text-warning',
  }[tone];
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{hint ? <Hint tip={hint}>{label}</Hint> : label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        </div>
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', toneClasses)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}