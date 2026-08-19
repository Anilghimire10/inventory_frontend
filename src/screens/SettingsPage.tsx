'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Store as StoreIcon, Building2, Download, Percent } from 'lucide-react';
import { BusinessApi, StoresApi } from '@/api';
import type { Store } from '@/types';
import { useStores } from '@/hooks/useStores';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, LoadingBlock } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { CURRENCIES } from '@/lib/currencies';

const empty = { name: '', address: '', phone: '' };
type Form = typeof empty;

export default function SettingsPage() {
  const qc = useQueryClient();
  const { show } = useToast();
  const { user, refresh } = useAuth();
  const { data: stores, isLoading } = useStores();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Store | null>(null);
  const [form, setForm] = useState<Form>(empty);

  // Business profile editing. The vertical (type) is locked — only a platform
  // super-admin can change it — so it isn't part of the editable form.
  const [bizOpen, setBizOpen] = useState(false);
  const [biz, setBiz] = useState({ name: '', salesModel: 'RETAIL', currency: 'USD', taxId: '' });

  // Full data export (owner).
  const [exporting, setExporting] = useState(false);
  const exportData = async () => {
    setExporting(true);
    try {
      const data = await BusinessApi.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(user?.business?.name ?? 'business').replace(/\s+/g, '-').toLowerCase()}-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      show('Data exported');
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
  const saveTax = useMutation({
    mutationFn: (next: boolean) => BusinessApi.update({ taxEnabled: next }),
    onSuccess: async (_data, next) => {
      await refresh();
      show(next ? 'Tax enabled' : 'Tax disabled');
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

  const save = useMutation({
    mutationFn: () =>
      editing ? StoresApi.update(editing.id, form) : StoresApi.create(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stores'] }); show(editing ? 'Store updated' : 'Store added'); setOpen(false); },
    onError: (e) => show(apiError(e), 'error'),
  });

  const openEdit = (s: Store) => { setEditing(s); setForm({ name: s.name, address: s.address ?? '', phone: s.phone ?? '' }); setOpen(true); };
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" description="Business profile and stores." />

      <Card className="mb-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> Business</CardTitle>
          <Button size="sm" variant="outline" onClick={openBiz}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div><div className="text-muted-foreground">Name</div><div className="font-medium">{user?.business?.name}</div></div>
          <div><div className="text-muted-foreground">Type</div><div className="font-medium">{user?.business?.type}</div></div>
          <div><div className="text-muted-foreground">Sells as</div><div className="font-medium">{user?.business?.salesModel === 'WHOLESALE' ? 'Wholesaler' : 'Retailer'}</div></div>
          <div><div className="text-muted-foreground">Currency</div><div className="font-medium">{user?.business?.currency}</div></div>
          <div><div className="text-muted-foreground">PAN / VAT</div><div className="font-medium">{user?.business?.taxId || '—'}</div></div>
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

      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold"><StoreIcon className="h-5 w-5 text-primary" /> Stores</h2>
        <Button size="sm" onClick={() => { setEditing(null); setForm(empty); setOpen(true); }}>
          <Plus className="h-4 w-4" /> Add store
        </Button>
      </div>

      {isLoading ? <LoadingBlock /> : !stores || stores.length === 0 ? (
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
              <Button size="icon" variant="ghost" onClick={() => openEdit(s)} aria-label={`Edit ${s.name}`}><Pencil className="h-4 w-4" /></Button>
            </Card>
          ))}
        </div>
      )}

      {user?.role === 'OWNER' && (
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
          Use the sun/moon toggle in the top bar to switch light/dark mode.
          To change the brand color across the whole app, edit the
          <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">--primary</code>
          value in <code className="rounded bg-muted px-1.5 py-0.5 text-xs">src/index.css</code>.
        </CardContent>
      </Card>

      <Dialog open={bizOpen} onClose={() => setBizOpen(false)} title="Edit business">
        <form onSubmit={(e) => { e.preventDefault(); saveBiz.mutate(); }} className="space-y-4">
          <Field label="Name">
            <Input value={biz.name} onChange={(e) => setBiz((b) => ({ ...b, name: e.target.value }))} required autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
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
          <Field label="PAN / VAT number (optional)">
            <Input value={biz.taxId} onChange={(e) => setBiz((b) => ({ ...b, taxId: e.target.value }))}
              placeholder="e.g. 301234567" />
          </Field>
          <p className="text-xs text-muted-foreground">
            Business type: <span className="font-medium">{user?.business?.type}</span>
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