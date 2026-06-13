'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Store as StoreIcon, Building2 } from 'lucide-react';
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

  // Business profile editing
  const [bizOpen, setBizOpen] = useState(false);
  const [biz, setBiz] = useState({ name: '', type: 'OTHER', currency: 'USD' });

  const openBiz = () => {
    setBiz({
      name: user?.business?.name ?? '',
      type: user?.business?.type ?? 'OTHER',
      currency: user?.business?.currency ?? 'USD',
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
        <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div><div className="text-muted-foreground">Name</div><div className="font-medium">{user?.business?.name}</div></div>
          <div><div className="text-muted-foreground">Type</div><div className="font-medium">{user?.business?.type}</div></div>
          <div><div className="text-muted-foreground">Currency</div><div className="font-medium">{user?.business?.currency}</div></div>
        </CardContent>
      </Card>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold"><StoreIcon className="h-5 w-5 text-primary" /> Stores</h2>
        <Button size="sm" onClick={() => { setEditing(null); setForm(empty); setOpen(true); }}>
          <Plus className="h-4 w-4" /> Add store
        </Button>
      </div>

      {isLoading ? <LoadingBlock /> : (
        <div className="space-y-2">
          {stores?.map((s) => (
            <Card key={s.id} className="flex items-center justify-between p-4">
              <div>
                <div className="flex items-center gap-2 font-medium">
                  {s.name} {!s.isActive && <Badge tone="muted">Inactive</Badge>}
                </div>
                <div className="text-sm text-muted-foreground">
                  {[s.address, s.phone].filter(Boolean).join(' · ') || 'No address set'}
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Use the sun/moon toggle in the top bar to switch light/dark mode.
          To change the brand color across the whole app, edit the
          <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">--primary</code>
          value in <code className="rounded bg-muted px-1.5 py-0.5 text-xs">web/src/index.css</code>.
        </CardContent>
      </Card>

      <Dialog open={bizOpen} onClose={() => setBizOpen(false)} title="Edit business">
        <form onSubmit={(e) => { e.preventDefault(); saveBiz.mutate(); }} className="space-y-4">
          <Field label="Name">
            <Input value={biz.name} onChange={(e) => setBiz((b) => ({ ...b, name: e.target.value }))} required autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={biz.type} onChange={(e) => setBiz((b) => ({ ...b, type: e.target.value }))}>
                <option value="GROCERY">Grocery</option>
                <option value="PHARMACY">Pharmacy</option>
                <option value="RETAIL">Retail</option>
                <option value="OTHER">Other</option>
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