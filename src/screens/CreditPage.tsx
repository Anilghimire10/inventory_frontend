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

  return (
    <div>
      <PageHeader
        title="Credit & Invoices"
        description="Track what customers owe you and what you owe suppliers."
      />

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Receivables"
          value={formatMoney(summary.data?.receivablesTotal ?? 0)}
          sub={`${summary.data?.customersOwing ?? 0} customers owe you`}
          icon={ArrowDownLeft}
          tone="success"
        />
        <SummaryCard
          label="Payables"
          value={formatMoney(summary.data?.payablesTotal ?? 0)}
          sub={`owed to ${summary.data?.suppliersOwed ?? 0} suppliers`}
          icon={ArrowUpRight}
          tone="destructive"
        />
        <SummaryCard
          label="Net position"
          value={formatMoney(summary.data?.netPosition ?? 0)}
          sub="receivables − payables"
          icon={Scale}
          tone={(summary.data?.netPosition ?? 0) >= 0 ? 'primary' : 'warning'}
        />
      </div>

      {/* Tabs */}
      <div className="mt-6 inline-flex rounded-lg border border-border bg-card p-1">
        <TabButton active={tab === 'receivables'} onClick={() => setTab('receivables')} icon={Wallet}>
          Receivables
        </TabButton>
        <TabButton active={tab === 'payables'} onClick={() => setTab('payables')} icon={HandCoins}>
          Payables
        </TabButton>
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
            <div className="space-y-3">
              {receivables.data.map((r) => (
                <ReceivableRow
                  key={r.id}
                  r={r}
                  onPay={() =>
                    setPayTarget({ kind: 'customer', id: r.id, name: r.name, max: r.balance })
                  }
                />
              ))}
            </div>
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
          <div className="space-y-3">
            {payables.data.map((p) => (
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
            ))}
          </div>
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
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <button onClick={() => setOpen((o) => !o)} className="flex flex-1 items-center gap-3 text-left">
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
          <div>
            <div className="font-medium">{r.name}</div>
            <div className="text-xs text-muted-foreground">
              {r.phone || `${r.invoices.length} credit invoice${r.invoices.length === 1 ? '' : 's'}`}
            </div>
          </div>
        </button>
        <div className="text-right">
          <div className="font-semibold text-success">{formatMoney(r.balance)}</div>
          <div className="text-xs text-muted-foreground">outstanding</div>
        </div>
        <Button size="sm" onClick={onPay}>Record payment</Button>
      </div>
      {open && <InvoiceTable invoices={r.invoices} />}
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
  const [open, setOpen] = useState(true);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <button onClick={() => setOpen((o) => !o)} className="flex flex-1 items-center gap-3 text-left">
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
          <div>
            <div className="font-medium">{p.name}</div>
            <div className="text-xs text-muted-foreground">
              {p.invoices.length} unpaid invoice{p.invoices.length === 1 ? '' : 's'}
            </div>
          </div>
        </button>
        <div className="text-right">
          <div className="font-semibold text-destructive">{formatMoney(p.outstanding)}</div>
          <div className="text-xs text-muted-foreground">you owe</div>
        </div>
      </div>
      {open && <InvoiceTable invoices={p.invoices} onPay={onPayInvoice} />}
    </Card>
  );
}

function InvoiceTable({
  invoices,
  onPay,
}: {
  invoices: CreditInvoice[];
  onPay?: (inv: CreditInvoice) => void;
}) {
  return (
    <div className="border-t border-border bg-muted/30">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 font-medium">Invoice</th>
            <th className="px-4 py-2 font-medium">Date</th>
            <th className="px-4 py-2 text-right font-medium">Total</th>
            <th className="px-4 py-2 text-right font-medium">Paid</th>
            <th className="px-4 py-2 text-right font-medium">Outstanding</th>
            {onPay && <th className="px-4 py-2" />}
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => {
            const outstanding = inv.outstanding ?? inv.total - inv.amountPaid;
            return (
              <tr key={inv.id} className="border-t border-border/60">
                <td className="px-4 py-2 font-medium">{inv.reference ?? inv.id.slice(0, 8)}</td>
                <td className="px-4 py-2 text-muted-foreground">{formatDate(inv.createdAt)}</td>
                <td className="px-4 py-2 text-right">{formatMoney(inv.total)}</td>
                <td className="px-4 py-2 text-right text-muted-foreground">{formatMoney(inv.amountPaid)}</td>
                <td className="px-4 py-2 text-right font-medium">{formatMoney(outstanding)}</td>
                {onPay && (
                  <td className="px-4 py-2 text-right">
                    {outstanding > 0 ? (
                      <Button size="sm" variant="outline" onClick={() => onPay(inv)}>
                        Pay
                      </Button>
                    ) : (
                      <Badge tone="muted">Paid</Badge>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
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
          <p className="mt-1 text-2xl font-semibold">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        </div>
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', toneClasses)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}
