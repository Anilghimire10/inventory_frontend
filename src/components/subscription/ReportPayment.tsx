'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, ImagePlus, Send, XCircle } from 'lucide-react';
import { SubscriptionApi } from '@/api';
import type { PaymentClaim, SubscriptionOverview, SubscriptionPaymentMethod, SubscriptionPlan } from '@/types';
import { planFits } from '@/lib/plans';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';

const METHODS: { value: SubscriptionPaymentMethod; label: string }[] = [
  { value: 'ESEWA', label: 'eSewa' },
  { value: 'KHALTI', label: 'Khalti' },
  { value: 'CONNECTIPS', label: 'connectIPS' },
  { value: 'BANK', label: 'Bank transfer' },
  { value: 'CASH', label: 'Cash' },
  { value: 'OTHER', label: 'Other' },
];
const METHOD_LABEL = Object.fromEntries(METHODS.map((m) => [m.value, m.label])) as Record<SubscriptionPaymentMethod, string>;
/** The API won't take these without a transaction ID or bank reference: it's how the payment is found. */
const NEEDS_REFERENCE: SubscriptionPaymentMethod[] = ['ESEWA', 'KHALTI', 'BANK'];
/** Screenshots the API takes: the product-image rules. */
const MAX_PROOF_BYTES = 5 * 1024 * 1024;

const money = (c: PaymentClaim) => formatMoney(c.amount, c.currency);
const monthsText = (m: number) => (m === 12 ? '1 year' : `${m} month${m === 1 ? '' : 's'}`);

/**
 * "I've paid": for money sent by QR, bank or cash rather than Pay online. The
 * shop reports it, an admin checks it against the statement and confirms --
 * which records the payment and extends the subscription -- or says why not.
 * Shows the report waiting, or the last one turned down, above the button.
 * `pass` is the lock screen's billing-only pass.
 */
export function ReportPayment({
  sub,
  plan,
  months,
  pass,
}: {
  sub: SubscriptionOverview;
  /** The plan and length picked on the page: the report starts on them. */
  plan: SubscriptionPlan | null;
  months?: number;
  pass?: string;
}) {
  const qc = useQueryClient();
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const pending = sub.claims.find((c) => c.status === 'PENDING');
  // Only the newest matters: a later report replaces an old refusal.
  const rejected = !pending && sub.claims[0]?.status === 'REJECTED' ? sub.claims[0] : null;

  const cancel = useMutation({
    mutationFn: (id: string) => SubscriptionApi.cancelReport(id, pass),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['subscription'] });
      show('Report withdrawn');
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  return (
    <div className="space-y-3">
      {pending ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-warning">
            <Clock className="h-4 w-4 shrink-0" /> Waiting for us to confirm
          </p>
          <p className="mt-1.5 text-foreground">
            {money(pending)} by {METHOD_LABEL[pending.method]}
            {pending.planName ? ` for ${pending.planName}` : ''}
            {pending.months ? `${pending.planName ? ',' : ' for'} ${monthsText(pending.months)}` : ''}
            {pending.reference ? ` · ref ${pending.reference}` : ''}, reported {formatDate(pending.createdAt)}.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            We check it against our statement, usually within a working day. Your subscription is extended as soon as we do.
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 h-8 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
            loading={cancel.isPending}
            onClick={() => cancel.mutate(pending.id)}
          >
            Withdraw this report
          </Button>
        </div>
      ) : (
        <>
          {rejected && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium text-destructive">
                <XCircle className="h-4 w-4 shrink-0" /> We couldn&apos;t confirm {money(rejected)} by {METHOD_LABEL[rejected.method]}
              </p>
              {rejected.rejectReason && <p className="mt-1.5 text-foreground">{rejected.rejectReason}</p>}
              <p className="mt-1 text-xs text-muted-foreground">Check the details and report it again, or ask about billing.</p>
            </div>
          )}
          {!rejected && sub.claims[0]?.status === 'CONFIRMED' && (
            <p className="flex items-center gap-2 text-xs text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> Your last report ({money(sub.claims[0])}) was confirmed.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Sent the money? Tell us, and we&apos;ll extend your subscription once we see it, usually within a working day.
          </p>
          <Button className="w-full" onClick={() => setOpen(true)}>
            <Send className="h-4 w-4" /> I&apos;ve paid
          </Button>
        </>
      )}
      {open && <ReportDialog sub={sub} initialPlan={plan} initialMonths={months} pass={pass} onClose={() => setOpen(false)} />}
    </div>
  );
}

function ReportDialog({
  sub,
  initialPlan,
  initialMonths,
  pass,
  onClose,
}: {
  sub: SubscriptionOverview;
  initialPlan: SubscriptionPlan | null;
  initialMonths?: number;
  pass?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { show } = useToast();
  const choosable = sub.plans.filter((p) => planFits(p, sub.activeStores));
  const [planId, setPlanId] = useState<string>(initialPlan?.id ?? choosable[0]?.id ?? '');
  const plan = sub.plans.find((p) => p.id === planId) ?? null;
  const first = plan?.prices.find((p) => p.months === initialMonths) ?? plan?.prices[0];
  const [months, setMonths] = useState<string>(first ? String(first.months) : '');
  const [amount, setAmount] = useState<string>(first ? String(first.amount) : '');
  const [method, setMethod] = useState<SubscriptionPaymentMethod>('ESEWA');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Picking a plan or a length fills in its price; the owner can still change it.
  const fill = (p: SubscriptionPlan | null, m: string) => {
    const price = p?.prices.find((x) => String(x.months) === m) ?? p?.prices[0];
    if (price) {
      setMonths(String(price.months));
      setAmount(String(price.amount));
    } else {
      setMonths(m);
    }
  };
  const pickPlan = (id: string) => {
    setPlanId(id);
    fill(sub.plans.find((p) => p.id === id) ?? null, months);
  };

  const send = useMutation({
    mutationFn: async () => {
      const proofUrl = proof ? (await SubscriptionApi.uploadProof(proof, pass)).url : undefined;
      return SubscriptionApi.reportPayment(
        {
          amount: Number(amount),
          method,
          reference: reference.trim() || undefined,
          months: months ? Number(months) : undefined,
          planId: planId || undefined,
          note: note.trim() || undefined,
          proofUrl,
        },
        pass,
      );
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['subscription'] });
      show("Thanks — we'll confirm your payment soon");
      onClose();
    },
    onError: (e) => setError(apiError(e)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 1) return setError('Enter the amount you paid');
    if (NEEDS_REFERENCE.includes(method) && !reference.trim())
      return setError('Add the transaction ID or bank reference, so we can find your payment');
    send.mutate();
  };

  return (
    <Dialog open onClose={onClose} title="Report a payment" description="Tell us what you sent, and we'll check it and extend your subscription.">
      <form onSubmit={submit} className="space-y-4">
        {sub.plans.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Plan">
              <Select value={planId} onChange={(e) => pickPlan(e.target.value)}>
                {choosable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value="">Not sure</option>
              </Select>
            </Field>
            <Field label="How long">
              <Select value={months} onChange={(e) => fill(plan, e.target.value)}>
                {(plan?.prices ?? [1, 3, 12].map((m) => ({ months: m }))).map((p) => (
                  <option key={p.months} value={String(p.months)}>
                    {monthsText(p.months)}
                  </option>
                ))}
                <option value="">Not sure</option>
              </Select>
            </Field>
          </div>
        )}
        <Field label={`Amount paid (${plan?.currency ?? sub.plans[0]?.currency ?? sub.online.currency})`}>
          <Input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paid by">
            <Select value={method} onChange={(e) => setMethod(e.target.value as SubscriptionPaymentMethod)}>
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={NEEDS_REFERENCE.includes(method) ? 'Transaction ID' : 'Reference (optional)'}>
            <Input
              value={reference}
              maxLength={100}
              onChange={(e) => setReference(e.target.value)}
              placeholder={method === 'BANK' ? 'Bank reference' : 'e.g. 0AB1CD2'}
            />
          </Field>
        </div>
        <Field label="Screenshot (optional)">
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-input px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent">
            <ImagePlus className="h-4 w-4 shrink-0" />
            <span className="truncate">{proof ? proof.name : 'Add a screenshot of the payment'}</span>
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.gif"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (f && f.size > MAX_PROOF_BYTES) {
                  setError('The screenshot is over 5 MB. Crop it or pick a smaller one.');
                  return;
                }
                setError(null);
                setProof(f);
              }}
            />
          </label>
        </Field>
        <Field label="Note (optional)">
          <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything that helps us find it" />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={send.isPending}>
            Send report
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
