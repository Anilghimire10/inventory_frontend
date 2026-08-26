'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Percent } from 'lucide-react';
import { TaxesApi } from '@/api';
import type { Tax } from '@/types';
import { useCrudResource } from '@/hooks/useCrudResource';
import { PageHeader, LoadingBlock, EmptyState, ErrorState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { useAuth } from '@/auth/AuthContext';
import { can } from '@/lib/permissions';

const empty = { name: '', rate: 0, isActive: true, isDefault: false };
type Form = typeof empty;

export default function TaxesPage() {
  const { user } = useAuth();
  const canManage = !!user && can.manageBusiness(user.role);
  const [form, setForm] = useState<Form>(empty);

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['taxes'], queryFn: () => TaxesApi.list() });

  const crud = useCrudResource<Tax>({
    queryKey: ['taxes'],
    api: TaxesApi,
    messages: { created: 'Tax created', updated: 'Tax updated', removed: 'Tax deleted' },
  });

  const openCreate = () => { setForm(empty); crud.openCreate(); };
  const openEdit = (t: Tax) => {
    setForm({ name: t.name, rate: Number(t.rate), isActive: t.isActive, isDefault: t.isDefault });
    crud.openEdit(t);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    crud.save.mutate(form);
  };

  return (
    <div>
      <PageHeader
        title="Taxes"
        description="Define the tax rates (e.g. VAT) you apply to products."
        action={canManage && <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add tax</Button>}
      />

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : !data || data.length === 0 ? (
        <EmptyState title="No taxes yet" description="Create a tax like “VAT 13%” to apply to your products." icon={Percent} />
      ) : (
        <Table>
          <THead>
            <TR><TH>Name</TH><TH className="text-right">Rate</TH><TH>Status</TH><TH></TH></TR>
          </THead>
          <TBody>
            {data.map((t) => (
              <TR key={t.id}>
                <TD className="font-medium">
                  {t.name} {t.isDefault && <Badge tone="primary">Default</Badge>}
                </TD>
                <TD className="text-right">{Number(t.rate)}%</TD>
                <TD>{t.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="muted">Inactive</Badge>}</TD>
                <TD>
                  {canManage && (
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(t)} aria-label={`Edit ${t.name}`}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" aria-label={`Delete ${t.name}`} onClick={() => crud.setRemoveTarget(t)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Dialog open={crud.open} onClose={crud.close} title={crud.editing ? 'Edit tax' : 'New tax'}>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name">
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required autoFocus placeholder="VAT" />
            </Field>
            <Field label="Rate (%)">
              <Input type="number" step="0.01" min="0" max="100" value={form.rate}
                onChange={(e) => setForm((f) => ({ ...f, rate: Number(e.target.value) }))} required />
            </Field>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} /> Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))} /> Default for new products
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={crud.close}>Cancel</Button>
            <Button type="submit" loading={crud.save.isPending}>{crud.editing ? 'Save' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!crud.removeTarget}
        title="Delete tax"
        description={crud.removeTarget ? `Delete the tax rate "${crud.removeTarget.name}"?` : undefined}
        confirmLabel="Delete"
        loading={crud.remove.isPending}
        onConfirm={() => {
          if (crud.removeTarget) crud.remove.mutate(crud.removeTarget.id);
        }}
        onCancel={() => crud.setRemoveTarget(null)}
      />
    </div>
  );
}
