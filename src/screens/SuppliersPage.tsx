'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Truck } from 'lucide-react';
import { SuppliersApi } from '@/api';
import type { Supplier } from '@/types';
import { PageHeader, LoadingBlock, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { can } from '@/lib/permissions';

const empty = { name: '', contactName: '', phone: '', email: '', address: '' };
type Form = typeof empty;

export default function SuppliersPage() {
  const qc = useQueryClient();
  const { show } = useToast();
  const { user } = useAuth();
  const canDelete = !!user && can.deleteCatalog(user.role);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [removeTarget, setRemoveTarget] = useState<Supplier | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => SuppliersApi.list({ limit: 100 }),
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        contactName: form.contactName || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
      };
      return editing ? SuppliersApi.update(editing.id, body) : SuppliersApi.create(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      show(editing ? 'Supplier updated' : 'Supplier added');
      setOpen(false);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => SuppliersApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); show('Supplier removed'); },
    onError: (e) => show(apiError(e), 'error'),
  });

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({
      name: s.name, contactName: s.contactName ?? '', phone: s.phone ?? '',
      email: s.email ?? '', address: s.address ?? '',
    });
    setOpen(true);
  };
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      <PageHeader title="Suppliers" description="Vendors you buy stock from."
        action={<Button onClick={() => { setEditing(null); setForm(empty); setOpen(true); }}>
          <Plus className="h-4 w-4" /> Add supplier</Button>} />

      {isLoading ? <LoadingBlock /> :
        !data || data.data.length === 0 ? (
          <EmptyState title="No suppliers" description="Add suppliers to record purchases against them." icon={Truck} />
        ) : (
          <Table>
            <THead><TR><TH>Name</TH><TH>Contact</TH><TH>Phone</TH><TH>Email</TH><TH></TH></TR></THead>
            <TBody>
              {data.data.map((s) => (
                <TR key={s.id}>
                  <TD className="font-medium">{s.name}</TD>
                  <TD>{s.contactName || '—'}</TD>
                  <TD>{s.phone || '—'}</TD>
                  <TD className="text-muted-foreground">{s.email || '—'}</TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(s)} aria-label={`Edit ${s.name}`}><Pencil className="h-4 w-4" /></Button>
                      {canDelete && (
                        <Button size="icon" variant="ghost" onClick={() => setRemoveTarget(s)} aria-label={`Remove ${s.name}`}>
                          <Trash2 className="h-4 w-4 text-destructive" /></Button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}

      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? 'Edit supplier' : 'New supplier'}>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
          <Field label="Name"><Input value={form.name} onChange={set('name')} required autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact name"><Input value={form.contactName} onChange={set('contactName')} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={set('phone')} /></Field>
          </div>
          <Field label="Email (optional)"><Input type="email" value={form.email} onChange={set('email')} /></Field>
          <Field label="Address"><Input value={form.address} onChange={set('address')} /></Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>{editing ? 'Save' : 'Add'}</Button>
          </DialogFooter>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!removeTarget}
        title="Remove supplier"
        description={removeTarget ? `Remove "${removeTarget.name}" and their record?` : undefined}
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() => {
          if (removeTarget) remove.mutate(removeTarget.id);
        }}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}