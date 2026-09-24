'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Truck } from 'lucide-react';
import { SuppliersApi } from '@/api';
import type { Supplier } from '@/types';
import { useCrudResource } from '@/hooks/useCrudResource';
import { PageHeader, LoadingBlock, EmptyState, ErrorState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Tooltip } from '@/components/ui/tooltip';
import { useAuth } from '@/auth/AuthContext';
import { can } from '@/lib/permissions';

const empty = { name: '', contactName: '', phone: '', email: '', address: '' };
type Form = typeof empty;

export default function SuppliersPage() {
  const { user } = useAuth();
  const canDelete = !!user && can.deleteCatalog(user.role);
  const [form, setForm] = useState<Form>(empty);
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['suppliers', page],
    queryFn: () => SuppliersApi.list({ page, limit: 20 }),
  });

  const crud = useCrudResource<Supplier>({
    queryKey: ['suppliers'],
    api: SuppliersApi,
    messages: { created: 'Supplier added', updated: 'Supplier updated', removed: 'Supplier removed' },
  });

  const openCreate = () => { setForm(empty); crud.openCreate(); };
  const openEdit = (s: Supplier) => {
    setForm({
      name: s.name, contactName: s.contactName ?? '', phone: s.phone ?? '',
      email: s.email ?? '', address: s.address ?? '',
    });
    crud.openEdit(s);
  };
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    crud.save.mutate({
      name: form.name,
      contactName: form.contactName || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      address: form.address || undefined,
    });
  };

  return (
    <div>
      <PageHeader title="Suppliers" description="Vendors you buy stock from."
        action={<Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add supplier</Button>} />

      {isError ? <ErrorState onRetry={() => refetch()} /> :
        isLoading ? <LoadingBlock /> :
        !data || data.data.length === 0 ? (
          <EmptyState title="No suppliers" description="Add suppliers to record purchases against them." icon={Truck} />
        ) : (
          <>
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
                      <Tooltip content="Edit">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(s)} aria-label={`Edit ${s.name}`}><Pencil className="h-4 w-4" /></Button>
                      </Tooltip>
                      {canDelete && (
                        <Tooltip content="Remove">
                          <Button size="icon" variant="ghost" onClick={() => crud.setRemoveTarget(s)} aria-label={`Remove ${s.name}`}>
                            <Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </Tooltip>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={data.meta.page} pages={data.meta.pages} onPage={setPage} />
          </>
        )}

      <Dialog open={crud.open} onClose={crud.close} title={crud.editing ? 'Edit supplier' : 'New supplier'}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name"><Input value={form.name} onChange={set('name')} required autoFocus /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Contact name"><Input value={form.contactName} onChange={set('contactName')} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={set('phone')} /></Field>
          </div>
          <Field label="Email (optional)"><Input type="email" value={form.email} onChange={set('email')} /></Field>
          <Field label="Address"><Input value={form.address} onChange={set('address')} /></Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={crud.close}>Cancel</Button>
            <Button type="submit" loading={crud.save.isPending}>{crud.editing ? 'Save' : 'Add'}</Button>
          </DialogFooter>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!crud.removeTarget}
        title="Remove supplier"
        description={crud.removeTarget ? `Remove "${crud.removeTarget.name}" and their record?` : undefined}
        confirmLabel="Remove"
        loading={crud.remove.isPending}
        onConfirm={() => {
          if (crud.removeTarget) crud.remove.mutate(crud.removeTarget.id);
        }}
        onCancel={() => crud.setRemoveTarget(null)}
      />
    </div>
  );
}