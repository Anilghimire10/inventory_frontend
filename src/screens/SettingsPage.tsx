'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Store as StoreIcon, Building2, Download, Percent, Power, RotateCcw, Wallet, CalendarClock, CreditCard } from 'lucide-react';
import { BusinessApi, StoresApi, SubscriptionApi } from '@/api';
import type { BusinessType, SettleMethod, Store } from '@/types';
import { SETTLE_METHODS, acceptedTenders } from '@/lib/payment-methods';
import { useStores } from '@/hooks/useStores';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, LoadingBlock, ErrorState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { apiError } from '@/lib/api';
import { CURRENCIES } from '@/lib/currencies';
import { saveFile } from '@/lib/save-file';
import { TIMEZONES, DEFAULT_TIMEZONE } from '@/lib/timezones';
import { formatMoney } from '@/lib/format';

const empty = { name: '', address: '', phone: '' };

// The same words the sign-up form uses for each type.
const BUSINESS_TYPE_LABEL: Record<BusinessType, string> = {
  GROCERY: 'Grocery',
  PHARMACY: 'Pharmacy',
  RETAIL: 'Retail',
  OTHER: 'Other',
};
const businessTypeLabel = (t?: string | null) => (t ? (BUSINESS_TYPE_LABEL[t as BusinessType] ?? t) : '—');
type Form = typeof empty;

export default function SettingsPage() {
  const qc = useQueryClient();
  const { show } = useToast();
  const { user, refresh } = useAuth();
  const { data: stores, isLoading, isError, refetch } = useStores();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Store | null>(null);
  const [deactivating, setDeactivating] = useState<Store | null>(null);
  const [form, setForm] = useState<Form>(empty);

  // Business profile editing. The vertical (type) is locked — only a platform
  // super-admin can change it — so it isn't part of the editable form.
  const [bizOpen, setBizOpen] = useState(false);
  const [biz, setBiz] = useState({ name: '', salesModel: 'RETAIL', currency: 'USD', timezone: DEFAULT_TIMEZONE, taxId: '' });

  // Full data export (owner).
  const [exporting, setExporting] = useState(false);
  const exportData = async () => {
    setExporting(true);
    try {
      // NDJSON, written through as the server streams it -- one line per row.
      // It arrives as text already, so there is nothing to re-serialise.
      const data = await BusinessApi.exportData();
      await saveFile(
        `${(user?.business?.name ?? 'business').replace(/\s+/g, '-').toLowerCase()}-backup-${new Date().toISOString().slice(0, 10)}.ndjson`,
        data,
        'application/x-ndjson',
      );
      show('Backup saved');
    } catch (e) {
      show(apiError(e), 'error');
    } finally {
      setExporting(false);
    }
  };

  const openBiz = () => {
    setBiz({
      name: user?.business?.name ?? '',
      salesModel: user?.business?.salesModel ?? 'RETAIL',
      currency: user?.business?.currency ?? 'USD',
      timezone: user?.business?.timezone ?? DEFAULT_TIMEZONE,
      taxId: user?.business?.taxId ?? '',
    });
    setBizOpen(true);
  };

  const saveBiz = useMutation({
    mutationFn: () => BusinessApi.update(biz),
    onSuccess: async () => {
      await refresh(); // reloads session + re-applies currency app-wide
      show('Business updated');
      setBizOpen(false);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  // Master tax switch. When off, no sale charges tax (even for taxable products).
  const taxEnabled = user?.business?.taxEnabled ?? true;
  const canManageBiz = user?.role === 'OWNER' || user?.role === 'MANAGER';
  const isOwner = user?.role === 'OWNER';
  // The last active store can't be deactivated -- nothing could take a sale.
  const activeCount = stores?.filter((s) => s.isActive).length ?? 0;
  const saveTax = useMutation({
    mutationFn: (next: boolean) => BusinessApi.update({ taxEnabled: next }),
    onSuccess: async (_data, next) => {
      await refresh();
      show(next ? 'Tax enabled' : 'Tax disabled');
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  // Whether selling prices already include their tax (backed out at checkout)
  // or have it added on top. Each sale remembers which way it was priced.
  const taxInclusive = user?.business?.taxInclusive ?? false;
  const saveInclusive = useMutation({
    mutationFn: (next: boolean) => BusinessApi.update({ taxInclusive: next }),
    onSuccess: async (_data, next) => {
      await refresh();
      show(next ? 'Prices now include tax' : 'Tax is now added on top of prices');
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  // Whether the PAN/VAT number prints on bills and invoices.
  const showPan = user?.business?.showTaxIdOnBill ?? false;
  const hasPan = !!user?.business?.taxId;
  const savePan = useMutation({
    mutationFn: (next: boolean) => BusinessApi.update({ showTaxIdOnBill: next }),
    onSuccess: async (_data, next) => {
      await refresh();
      show(next ? 'PAN will show on bills' : 'PAN hidden on bills');
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  // The tenders this shop takes. Cash can't be turned off: it is the counter
  // default and what a part-paid sale falls back to.
  const tenders = acceptedTenders(user?.business?.acceptedTenders).map((t) => t.value);
  const saveTenders = useMutation({
    mutationFn: (next: SettleMethod[]) => BusinessApi.update({ acceptedTenders: next }),
    onSuccess: async () => {
      await refresh();
      show('Payment methods saved');
    },
    onError: (e) => show(apiError(e), 'error'),
  });
  const toggleTender = (m: SettleMethod) =>
    saveTenders.mutate(tenders.includes(m) ? tenders.filter((t) => t !== m) : [...tenders, m]);

  // The plan's branch limit, to say how many are left before Add store is refused.
  const { data: sub } = useQuery({
    queryKey: ['subscription'],
    queryFn: () => SubscriptionApi.overview(),
    enabled: canManageBiz,
  });
  const branchLimit = sub?.currentPlan?.maxStores ?? null;
  const planFull = branchLimit !== null && (sub?.activeStores ?? 0) >= branchLimit;

  // Cash-drawer rules. Blind close hides expected cash from cashiers; the
  // limit makes a drawer that is off by more than it need a note to close.
  const blindClose = user?.business?.shiftBlindClose ?? false;
  const savedLimit = user?.business?.shiftVarianceNoteOver ?? null;
  const [limit, setLimit] = useState<string | null>(null);
  const limitText = limit ?? (savedLimit === null ? '' : String(Number(savedLimit)));
  const saveBlind = useMutation({
    mutationFn: (next: boolean) => BusinessApi.update({ shiftBlindClose: next }),
    onSuccess: async (_data, next) => {
      await refresh();
      show(next ? 'Cashiers now close blind' : 'Cashiers see expected cash at close');
    },
    onError: (e) => show(apiError(e), 'error'),
  });
  const saveLimit = useMutation({
    mutationFn: () =>
      BusinessApi.update({
        shiftVarianceNoteOver: limitText.trim() === '' ? null : Math.max(0, Number(limitText) || 0),
      }),
    onSuccess: async () => {
      await refresh();
      setLimit(null);
      show(limitText.trim() === '' ? 'A note is never required' : 'Variance limit saved');
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const save = useMutation({
    mutationFn: () =>
      editing ? StoresApi.update(editing.id, form) : StoresApi.create(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stores'] }); qc.invalidateQueries({ queryKey: ['subscription'] }); show(editing ? 'Store updated' : 'Store added'); setOpen(false); },
    onError: (e) => show(apiError(e), 'error'),
  });

  // DELETE /stores/:id is a soft delete — it flips `isActive` to false and
  // keeps every sale, purchase and stock row attached to the store. Owner only,
  // matching the backend guard; reactivating is a plain update, so a manager
  // can do that too.
  const deactivate = useMutation({
    mutationFn: (id: string) => StoresApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stores'] });
      qc.invalidateQueries({ queryKey: ['subscription'] });
      show('Store deactivated');
      setDeactivating(null);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const reactivate = useMutation({
    mutationFn: (id: string) => StoresApi.update(id, { isActive: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stores'] });
      qc.invalidateQueries({ queryKey: ['subscription'] });
      show('Store reactivated');
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const openEdit = (s: Store) => { setEditing(s); setForm({ name: s.name, address: s.address ?? '', phone: s.phone ?? '' }); setOpen(true); };
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Settings"
        description="Business profile and stores."
        action={
          <Link
            href="/subscription"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium hover:bg-accent"
          >
            <CalendarClock className="h-4 w-4" /> Subscription
          </Link>
        }
      />

      <Card className="mb-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> Business</CardTitle>
          <Button size="sm" variant="outline" onClick={openBiz}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 md:grid-cols-4">
          <div><div className="text-muted-foreground">Name</div><div className="font-medium">{user?.business?.name}</div></div>
          <div><div className="text-muted-foreground">Type</div><div className="font-medium">{businessTypeLabel(user?.business?.type)}</div></div>
          <div><div className="text-muted-foreground">Sells as</div><div className="font-medium">{user?.business?.salesModel === 'WHOLESALE' ? 'Wholesaler' : 'Retailer'}</div></div>
          <div><div className="text-muted-foreground">Currency</div><div className="font-medium">{user?.business?.currency}</div></div>
          <div><div className="text-muted-foreground">PAN / VAT</div><div className="font-medium">{user?.business?.taxId || '—'}</div></div>
          <div><div className="text-muted-foreground">Time zone</div><div className="font-medium">{(user?.business?.timezone ?? DEFAULT_TIMEZONE).replace(/_/g, ' ')}</div></div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Percent className="h-5 w-5 text-primary" /> Tax</CardTitle>
          <button
            type="button"
            role="switch"
            aria-checked={taxEnabled}
            disabled={!canManageBiz || saveTax.isPending}
            onClick={() => saveTax.mutate(!taxEnabled)}
            className={
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ' +
              (taxEnabled ? 'bg-primary' : 'bg-muted')
            }
          >
            <span
              className={
                'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ' +
                (taxEnabled ? 'translate-x-5' : 'translate-x-0.5')
              }
            />
          </button>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {taxEnabled
            ? 'Tax is ON. Each sale charges tax on products marked “Taxable” using their tax rate. Products that aren’t taxable are never taxed.'
            : 'Tax is OFF. No sale charges tax, even for products marked “Taxable”.'}
          {taxEnabled && (
            <div className="mt-4 flex items-start justify-between gap-4 border-t border-border pt-4">
              <div>
                <div id="tax-inclusive-label" className="font-medium text-foreground">Prices include tax</div>
                <div>
                  {taxInclusive
                    ? 'A product’s price is what the customer pays; the tax is taken out of it on the bill (113 at 13% is 100 + 13 tax).'
                    : 'Tax is added on top of a product’s price at checkout (100 at 13% comes to 113).'}{' '}
                  Sales already made keep the way they were priced.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={taxInclusive}
                aria-labelledby="tax-inclusive-label"
                disabled={!canManageBiz || saveInclusive.isPending}
                onClick={() => saveInclusive.mutate(!taxInclusive)}
                className={
                  'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ' +
                  (taxInclusive ? 'bg-primary' : 'bg-muted')
                }
              >
                <span
                  className={
                    'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ' +
                    (taxInclusive ? 'translate-x-5' : 'translate-x-0.5')
                  }
                />
              </button>
            </div>
          )}
          {!canManageBiz && <span className="block pt-1">Only an owner or manager can change this.</span>}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> PAN on bill</CardTitle>
          <button
            type="button"
            role="switch"
            aria-checked={showPan}
            disabled={!canManageBiz || savePan.isPending}
            onClick={() => savePan.mutate(!showPan)}
            className={
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ' +
              (showPan ? 'bg-primary' : 'bg-muted')
            }
          >
            <span
              className={
                'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ' +
                (showPan ? 'translate-x-5' : 'translate-x-0.5')
              }
            />
          </button>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {showPan
            ? 'Your PAN/VAT number is printed on receipts and invoices.'
            : 'Your PAN/VAT number is hidden on receipts and invoices.'}
          {!hasPan && <span className="block pt-1">Add a PAN/VAT number with “Edit” above for it to appear.</span>}
          {!canManageBiz && <span className="block pt-1">Only an owner or manager can change this.</span>}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> Payment methods</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div>
            The ways your customers can pay. Only these show at checkout, when a
            khata or supplier is paid, and for refunds. Money taken on Khalti or
            connectIPS goes to your own account; this only records how the bill was paid.
          </div>
          <div className="flex flex-wrap gap-2">
            {SETTLE_METHODS.map((m) => {
              const on = tenders.includes(m.value);
              const locked = m.value === 'CASH';
              return (
                <Tooltip key={m.value} content={locked ? 'Cash is always accepted' : undefined}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    disabled={locked || !canManageBiz || saveTenders.isPending}
                    onClick={() => toggleTender(m.value)}
                    className={
                      'inline-flex h-9 items-center gap-2 rounded-md border px-3 font-medium transition-colors disabled:cursor-not-allowed ' +
                      (on
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-input text-foreground hover:bg-accent') +
                      (locked ? '' : ' disabled:opacity-50')
                    }
                  >
                    <span
                      className={
                        'flex h-4 w-4 items-center justify-center rounded-sm border text-[10px] leading-none ' +
                        (on ? 'border-primary bg-primary text-primary-foreground' : 'border-input')
                      }
                      aria-hidden
                    >
                      {on ? '✓' : ''}
                    </span>
                    {m.label}
                  </button>
                </Tooltip>
              );
            })}
          </div>
          {!canManageBiz && <span className="block">Only an owner or manager can change this.</span>}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" /> Shifts &amp; cash drawer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div id="blind-close-label" className="font-medium text-foreground">Blind close for cashiers</div>
              <div>
                {blindClose
                  ? 'Cashiers count the drawer without seeing what it should hold, and aren’t shown the difference. Owners and managers still see everything.'
                  : 'Cashiers see the expected cash while they count. Turn this on so they count what is really there instead of typing the expected figure.'}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={blindClose}
              aria-labelledby="blind-close-label"
              disabled={!canManageBiz || saveBlind.isPending}
              onClick={() => saveBlind.mutate(!blindClose)}
              className={
                'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ' +
                (blindClose ? 'bg-primary' : 'bg-muted')
              }
            >
              <span
                className={
                  'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ' +
                  (blindClose ? 'translate-x-5' : 'translate-x-0.5')
                }
              />
            </button>
          </div>
          <div className="border-t border-border pt-4">
            <div className="font-medium text-foreground">Ask for a note when the drawer is off by more than</div>
            <div>
              Closing a shift over or short by more than this needs a reason. Leave it empty to never ask.
              {blindClose && ' Cashiers closing blind are never asked, because they can’t see the difference.'}
            </div>
            <div className="mt-2 flex max-w-xs gap-2">
              <Input
                type="number"
                min="0"
                step="0.01"
                aria-label="Variance limit"
                placeholder="e.g. 100"
                disabled={!canManageBiz || saveLimit.isPending}
                value={limitText}
                onChange={(e) => setLimit(e.target.value)}
              />
              <Button
                variant="outline"
                disabled={!canManageBiz || limit === null}
                loading={saveLimit.isPending}
                onClick={() => saveLimit.mutate()}
              >
                Save
              </Button>
            </div>
          </div>
          {!canManageBiz && <span className="block">Only an owner or manager can change this.</span>}
        </CardContent>
      </Card>

      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><StoreIcon className="h-5 w-5 text-primary" /> Stores</h2>
          {sub?.currentPlan && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {branchLimit === null
                ? `${sub.currentPlan.name} plan: unlimited branches.`
                : `${sub.activeStores} of ${branchLimit} branch${branchLimit === 1 ? '' : 'es'} open on your ${sub.currentPlan.name} plan.`}
              {planFull && (
                <>
                  {' '}
                  <Link href="/subscription" className="font-medium text-primary hover:underline">Choose a bigger plan</Link> to add more.
                </>
              )}
            </p>
          )}
        </div>
        <Tooltip content={planFull ? 'Your plan’s branch limit is reached' : undefined}>
          <Button
            size="sm"
            disabled={planFull}
            onClick={() => { setEditing(null); setForm(empty); setOpen(true); }}
          >
            <Plus className="h-4 w-4" /> Add store
          </Button>
        </Tooltip>
      </div>

      {isError ? <ErrorState onRetry={() => refetch()} /> :
        isLoading ? <LoadingBlock /> : !stores || stores.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No stores yet — add one to organize stock and sales by location.
        </Card>
      ) : (
        <div className="space-y-2">
          {stores.map((s) => (
            <Card key={s.id} className="flex items-center justify-between p-4">
              <div>
                <div className="flex items-center gap-2 font-medium">
                  {s.name} {!s.isActive && <Badge tone="muted">Inactive</Badge>}
                </div>
                <div className="text-sm text-muted-foreground">
                  {[s.address, s.phone].filter(Boolean).join(' · ') || 'No address set'}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Tooltip content="Edit">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(s)} aria-label={`Edit ${s.name}`}><Pencil className="h-4 w-4" /></Button>
                </Tooltip>
                {!s.isActive ? (
                  canManageBiz && (
                    <Tooltip content="Reactivate this store">
                      <Button
                        size="icon"
                        variant="ghost"
                        loading={reactivate.isPending && reactivate.variables === s.id}
                        onClick={() => reactivate.mutate(s.id)}
                        aria-label={`Reactivate ${s.name}`}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                  )
                ) : (
                  isOwner &&
                  activeCount > 1 && (
                    <Tooltip content="Deactivate this store">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeactivating(s)}
                        aria-label={`Deactivate ${s.name}`}
                      >
                        <Power className="h-4 w-4 text-destructive" />
                      </Button>
                    </Tooltip>
                  )
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Not while an admin is viewing as the owner: the API refuses it then. */}
      {user?.role === 'OWNER' && !user.impersonation && (
        <Card className="mt-6">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5 text-primary" /> Your data</CardTitle>
            <Button size="sm" variant="outline" loading={exporting} onClick={exportData}>
              <Download className="h-4 w-4" /> Export all data
            </Button>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Download a full JSON snapshot of your business — products, stock, sales, customers, purchases, and more.
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Use the sun/moon button in the top bar to switch between light and dark mode.
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deactivating}
        title={`Deactivate ${deactivating?.name ?? 'store'}?`}
        description="Its sales, purchases and stock history are kept, and it stops being offered when recording new ones. You can reactivate it here at any time."
        confirmLabel="Deactivate"
        loading={deactivate.isPending}
        onConfirm={() => deactivating && deactivate.mutate(deactivating.id)}
        onCancel={() => setDeactivating(null)}
      />

      <Dialog open={bizOpen} onClose={() => setBizOpen(false)} title="Edit business">
        <form onSubmit={(e) => { e.preventDefault(); saveBiz.mutate(); }} className="space-y-4">
          <Field label="Name">
            <Input value={biz.name} onChange={(e) => setBiz((b) => ({ ...b, name: e.target.value }))} required autoFocus />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Sells as">
              <Select value={biz.salesModel} onChange={(e) => setBiz((b) => ({ ...b, salesModel: e.target.value }))}>
                <option value="RETAIL">Retailer</option>
                <option value="WHOLESALE">Wholesaler</option>
              </Select>
            </Field>
            <Field label="Currency">
              <Select value={biz.currency} onChange={(e) => setBiz((b) => ({ ...b, currency: e.target.value }))}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.label}</option>
                ))}
              </Select>
            </Field>
          </div>
          {/* Changing currency relabels every amount; nothing is converted. */}
          {biz.currency !== (user?.business?.currency ?? biz.currency) && (
            <div role="alert" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              <p className="font-medium text-foreground">
                Amounts won&apos;t be converted
              </p>
              <p className="mt-1 text-muted-foreground">
                Every price and total keeps its number and just shows in {biz.currency} instead of{' '}
                {user?.business?.currency}: a product at {formatMoney(10, user?.business?.currency ?? 'USD')} becomes{' '}
                {formatMoney(10, biz.currency)}. That includes past sales, reports and what customers owe. Change it
                before adding products, or update your prices afterwards.
              </p>
              <p className="mt-1 text-muted-foreground">
                Your subscription plans will show in {biz.currency === 'NPR' ? 'NPR, and you can pay online with eSewa, Khalti or connectIPS' : 'US dollars, paid by bank or QR'}.
              </p>
            </div>
          )}
          <Field label="Time zone">
            <Select value={biz.timezone} onChange={(e) => setBiz((b) => ({ ...b, timezone: e.target.value }))}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Where the shop&apos;s day starts and ends. Reports, daily totals and the
              hour-of-day chart are all cut on this, not on the server&apos;s clock.
            </p>
          </Field>
          <Field label="PAN / VAT number (optional)">
            <Input value={biz.taxId} onChange={(e) => setBiz((b) => ({ ...b, taxId: e.target.value }))}
              placeholder="e.g. 301234567" />
          </Field>
          <p className="text-xs text-muted-foreground">
            Business type: <span className="font-medium">{businessTypeLabel(user?.business?.type)}</span>
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBizOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saveBiz.isPending}>Save</Button>
          </DialogFooter>
        </form>
      </Dialog>

      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? 'Edit store' : 'New store'}>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
          <Field label="Name"><Input value={form.name} onChange={set('name')} required autoFocus /></Field>
          <Field label="Address"><Input value={form.address} onChange={set('address')} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={set('phone')} /></Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>{editing ? 'Save' : 'Add'}</Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}