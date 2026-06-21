'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Users, HandCoins } from 'lucide-react';
import { CustomersApi } from '@/api';
import type { Customer } from '@/types';
import { PageHeader, LoadingBlock, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useAuth } from '@/auth/AuthContext';
import { can } from '@/lib/permissions';

const empty = { name: '', phone: '', email: '', address: '' };
type Form = typeof empty;

export default function CustomersPage() {
  const qc = useQueryClient();
  const { show } = useToast();
  const { user } = useAuth();
  const canDelete = !!user && can.deleteCustomers(user.role);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [payFor, setPayFor] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: () => CustomersApi.list({ limit: 100 }),
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
      };
      return editing ? CustomersApi.update(editing.id, body) : CustomersApi.create(body);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); show(editing ? 'Customer updated' : 'Customer added'); setOpen(false); },
    onError: (e) => show(apiError(e), 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => CustomersApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); show('Customer removed'); },
    onError: (e) => show(apiError(e), 'error'),
  });

  const pay = useMutation({
    mutationFn: () => CustomersApi.payCredit(payFor!.id, payAmount),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); show('Payment recorded'); setPayFor(null); },
    onError: (e) => show(apiError(e), 'error'),
  });

  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '' });
    setOpen(true);
  };
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      <PageHeader title="Customers" description="Customer records and credit balances."
        action={<Button onClick={() => { setEditing(null); setForm(empty); setOpen(true); }}>
          <Plus className="h-4 w-4" /> Add customer</Button>} />

      {isLoading ? <LoadingBlock /> :
        !data || data.data.length === 0 ? (
          <EmptyState title="No customers" description="Add customers to track purchases and credit." icon={Users} />
        ) : (
          <Table>
            <THead><TR><TH>Name</TH><TH>Phone</TH><TH>Email</TH><TH className="text-right">Credit due</TH><TH></TH></TR></THead>
            <TBody>
              {data.data.map((c) => {
                const due = Number(c.creditBalance);
                return (
                  <TR key={c.id}>
                    <TD className="font-medium">{c.name}</TD>
                    <TD>{c.phone || '—'}</TD>
                    <TD className="text-muted-foreground">{c.email || '—'}</TD>
                    <TD className="text-right">
                      {due > 0 ? <Badge tone="warning">{formatMoney(due)}</Badge> : <span className="text-muted-foreground">—</span>}
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        {due > 0 && (
                          <Button size="icon" variant="ghost" title="Record payment"
                            onClick={() => { setPayFor(c); setPayAmount(due); }}>
                            <HandCoins className="h-4 w-4 text-success" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                        {canDelete && (
                          <Button size="icon" variant="ghost" onClick={() => confirm(`Remove "${c.name}"?`) && remove.mutate(c.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" /></Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}

      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? 'Edit customer' : 'New customer'}>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
          <Field label="Name"><Input value={form.name} onChange={set('name')} required autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone"><Input value={form.phone} onChange={set('phone')} /></Field>
            <Field label="Email (optional)"><Input type="email" value={form.email} onChange={set('email')} /></Field>
          </div>
          <Field label="Address"><Input value={form.address} onChange={set('address')} /></Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>{editing ? 'Save' : 'Add'}</Button>
          </DialogFooter>
        </form>
      </Dialog>

      <Dialog open={!!payFor} onClose={() => setPayFor(null)} title="Record credit payment" description={payFor?.name}>
        <form onSubmit={(e) => { e.preventDefault(); pay.mutate(); }} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Outstanding: <span className="font-medium text-foreground">{formatMoney(payFor?.creditBalance ?? 0)}</span>
          </p>
          <Field label="Amount received">
            <Input type="number" step="0.01" min="0" max={Number(payFor?.creditBalance ?? 0)}
              value={payAmount} onChange={(e) => setPayAmount(Number(e.target.value))} autoFocus />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPayFor(null)}>Cancel</Button>
            <Button type="submit" loading={pay.isPending} disabled={payAmount <= 0}>Record payment</Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}