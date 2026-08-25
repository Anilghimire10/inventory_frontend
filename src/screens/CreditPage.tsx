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
} from 'lucide-react';
import { CreditApi, CustomersApi, PurchasesApi } from '@/api';
import type { CreditInvoice, Payable, Receivable } from '@/types';
import { PageHeader, LoadingBlock, EmptyState } from '@/components/ui/misc';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { formatMoney, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

type Tab = 'receivables' | 'payables';

// What the payment dialog is settling.
type PayTarget =
  | { kind: 'customer'; id: string; name: string; max: number }
  | { kind: 'purchase'; id: string; name: string; max: number };

export default function CreditPage() {
  const qc = useQueryClient();
  const { show } = useToast();
  const [tab, setTab] = useState<Tab>('receivables');
  const [query, setQuery] = useState('');
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null);

  const summary = useQuery({ queryKey: ['credit', 'summary'], queryFn: () => CreditApi.summary() });
  const receivables = useQuery({
    queryKey: ['credit', 'receivables'],
    queryFn: () => CreditApi.receivables(),
    enabled: tab === 'receivables',
  });
  const payables = useQuery({
    queryKey: ['credit', 'payables'],
    queryFn: () => CreditApi.payables(),
    enabled: tab === 'payables',
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['credit'] });

  const pay = useMutation({
    mutationFn: ({
      target,
      amount,
    }: {
      target: PayTarget;
      amount: number;
    }): Promise<unknown> =>
      target.kind === 'customer'
        ? CustomersApi.payCredit(target.id, amount)
        : PurchasesApi.pay(target.id, amount),
    onSuccess: () => {
      show('Payment recorded');
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

  const receivablesTotal = summary.data?.receivablesTotal ?? 0;
  const payablesTotal = summary.data?.payablesTotal ?? 0;

  return (
    <div>
      <PageHeader
        title="Credit"
        description="Track what customers owe you and what you owe suppliers."
      />

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Receivables"
          value={formatMoney(receivablesTotal)}
          sub={`${summary.data?.customersOwing ?? 0} customers owe you`}
          icon={ArrowDownLeft}
          tone="success"
        />
        <SummaryCard
          label="Payables"
          value={formatMoney(payablesTotal)}
          sub={`${summary.data?.suppliersOwed ?? 0} suppliers to pay`}
          icon={ArrowUpRight}
          tone="destructive"
        />
        <SummaryCard
          label="Outstanding"
          value={formatMoney(receivablesTotal + payablesTotal)}
          sub="receivables + payables"
          icon={Scale}
          tone="primary"
        />
      </div>

      {/* Tabs + search */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          <TabButton active={tab === 'receivables'} onClick={() => setTab('receivables')} icon={Wallet}>
            Receivables
          </TabButton>
          <TabButton active={tab === 'payables'} onClick={() => setTab('payables')} icon={HandCoins}>
            Payables
          </TabButton>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={tab === 'receivables' ? 'Search customer…' : 'Search supplier…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-4">
        {tab === 'receivables' ? (
          receivables.isLoading ? (
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
          onSubmit={(amount) => pay.mutate({ target: payTarget, amount })}
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
  onSubmit,
}: {
  target: PayTarget;
  loading: boolean;
  onClose: () => void;
  onSubmit: (amount: number) => void;
}) {
  const [amount, setAmount] = useState(target.max);
  return (
    <Dialog open onClose={onClose} title="Record payment">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(amount);
        }}
        className="space-y-4"
      >
        <p className="text-sm text-muted-foreground">
          {target.kind === 'customer' ? 'Payment from' : 'Payment to'}{' '}
          <span className="font-medium text-foreground">{target.name}</span>. Outstanding{' '}
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
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading} disabled={amount <= 0 || amount > target.max}>
            Record {formatMoney(amount || 0)}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

function SummaryCard({
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
          <p className="text-sm text-muted-foreground">{label}</p>
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