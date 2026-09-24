'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, RotateCcw, Trash2, UserX, UserCog } from 'lucide-react';
import { UsersApi, StoresApi } from '@/api';
import type { AppUser, UserRole } from '@/types';
import { useAuth } from '@/auth/AuthContext';
import { useCrudResource } from '@/hooks/useCrudResource';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { PageHeader, LoadingBlock, EmptyState, ErrorState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';

const ROLES: UserRole[] = ['OWNER', 'MANAGER', 'CASHIER', 'STOCK_KEEPER'];

export default function UsersPage() {
  const { user: me } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'CASHIER' as UserRole, storeId: '' });

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['users'], queryFn: () => UsersApi.list() });
  const { data: stores } = useQuery({ queryKey: ['stores'], queryFn: () => StoresApi.list() });

  const crud = useCrudResource<AppUser>({
    queryKey: ['users'],
    api: UsersApi,
    messages: { created: 'Staff added', updated: 'Staff updated', removed: 'Staff deactivated' },
  });

  // Permanent delete is a separate, owner-only action on an already-deactivated
  // account, so it gets its own target + mutation rather than reusing crud.remove
  // (which deactivates).
  const qc = useQueryClient();
  const { show } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const destroy = useMutation({
    mutationFn: (id: string) => UsersApi.destroy(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      show('Staff deleted permanently');
      setDeleteTarget(null);
    },
    onError: (e) => show(apiError(e), 'error'),
  });
  // Deactivating was a one-way trip in the UI: PATCH already accepts
  // `isActive`, the edit form just never sent it. Same shape as the store
  // reactivate in Settings.
  const reactivate = useMutation({
    mutationFn: (id: string) => UsersApi.update(id, { isActive: true }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      show('Staff reactivated');
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const isOwner = me?.role === 'OWNER';

  const openCreate = () => { setForm({ name: '', email: '', password: '', role: 'CASHIER', storeId: me?.storeId ?? stores?.[0]?.id ?? '' }); crud.openCreate(); };
  const openEdit = (u: AppUser) => { setForm({ name: u.name, email: u.email, password: '', role: u.role, storeId: u.storeId ?? '' }); crud.openEdit(u); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (crud.editing) {
      const body: Record<string, unknown> = { name: form.name, role: form.role, storeId: form.storeId || null };
      if (form.password) body.password = form.password;
      crud.save.mutate(body);
    } else {
      crud.save.mutate({ ...form, storeId: form.storeId || undefined });
    }
  };

  return (
    <div>
      <PageHeader title="Staff" description="Team members and their roles."
        action={<Button onClick={openCreate}><Plus className="h-4 w-4" /> Add staff</Button>} />

      {isError ? <ErrorState onRetry={() => refetch()} /> :
        isLoading ? <LoadingBlock /> :
        !data || data.length === 0 ? (
          <EmptyState title="No staff" description="Invite your team and assign roles." icon={UserCog} />
        ) : (
          <Table>
            <THead><TR><TH>Name</TH><TH>Email</TH><TH>Role</TH><TH>Status</TH><TH></TH></TR></THead>
            <TBody>
              {data.map((u) => (
                <TR key={u.id}>
                  <TD className="font-medium">{u.name}{u.id === me?.id && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}</TD>
                  <TD className="text-muted-foreground">{u.email}</TD>
                  <TD><Badge tone="primary">{u.role}</Badge></TD>
                  <TD>{u.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="muted">Inactive</Badge>}</TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Tooltip content="Edit">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(u)} aria-label={`Edit ${u.name}`}><Pencil className="h-4 w-4" /></Button>
                      </Tooltip>
                      {u.id !== me?.id && u.isActive && (
                        <Tooltip content="Deactivate">
                          <Button size="icon" variant="ghost" aria-label={`Deactivate ${u.name}`} onClick={() => crud.setRemoveTarget(u)}>
                            <UserX className="h-4 w-4 text-destructive" /></Button>
                        </Tooltip>
                      )}
                      {u.id !== me?.id && !u.isActive && (
                        <Tooltip content="Reactivate">
                          <Button
                            size="icon"
                            variant="ghost"
                            loading={reactivate.isPending && reactivate.variables === u.id}
                            onClick={() => reactivate.mutate(u.id)}
                            aria-label={`Reactivate ${u.name}`}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </Tooltip>
                      )}
                      {u.id !== me?.id && !u.isActive && isOwner && (
                        <Tooltip content="Delete permanently">
                          <Button size="icon" variant="ghost" aria-label={`Delete ${u.name} permanently`} onClick={() => setDeleteTarget(u)}>
                            <Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </Tooltip>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}

      <Dialog open={crud.open} onClose={crud.close} title={crud.editing ? 'Edit staff' : 'Add staff'}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required autoFocus /></Field>
          <Field label="Email">
            <Input type="email" value={form.email} disabled={!!crud.editing}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
          </Field>
          {crud.editing?.id === me?.id ? (
            /* Setting your own password here would retire the token making the
               request, so the API refuses it — Settings hands back a fresh one. */
            <p className="text-sm text-muted-foreground">
              To change your own password, use Settings → Change password.
            </p>
          ) : (
            <Field label={crud.editing ? 'New password (leave blank to keep)' : 'Password'}>
              <PasswordInput value={form.password} minLength={crud.editing ? undefined : 8}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required={!crud.editing} />
            </Field>
          )}
          <Field label="Role">
            <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
          <Field label="Store">
            <Select value={form.storeId} onChange={(e) => setForm((f) => ({ ...f, storeId: e.target.value }))}>
              <option value="">No store assigned</option>
              {stores?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={crud.close}>Cancel</Button>
            <Button type="submit" loading={crud.save.isPending}>{crud.editing ? 'Save' : 'Add'}</Button>
          </DialogFooter>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!crud.removeTarget}
        title="Deactivate staff"
        description={crud.removeTarget ? `Deactivate ${crud.removeTarget.name}? They won't be able to sign in.` : undefined}
        confirmLabel="Deactivate"
        loading={crud.remove.isPending}
        onConfirm={() => {
          if (crud.removeTarget) crud.remove.mutate(crud.removeTarget.id);
        }}
        onCancel={() => crud.setRemoveTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete staff permanently"
        description={deleteTarget ? `Permanently delete ${deleteTarget.name}? This cannot be undone. Staff with sales, shifts or stock movements on record can't be deleted — they stay deactivated.` : undefined}
        confirmLabel="Delete permanently"
        loading={destroy.isPending}
        onConfirm={() => {
          if (deleteTarget) destroy.mutate(deleteTarget.id);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
