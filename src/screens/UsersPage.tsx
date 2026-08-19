'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, UserX, UserCog } from 'lucide-react';
import { UsersApi } from '@/api';
import type { AppUser, UserRole } from '@/types';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, LoadingBlock, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';

const ROLES: UserRole[] = ['OWNER', 'MANAGER', 'CASHIER', 'STOCK_KEEPER'];

export default function UsersPage() {
  const qc = useQueryClient();
  const { show } = useToast();
  const { user: me } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'CASHIER' as UserRole });
  const [deactivateTarget, setDeactivateTarget] = useState<AppUser | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => UsersApi.list() });

  const save = useMutation({
    mutationFn: () => {
      if (editing) {
        const body: Record<string, unknown> = { name: form.name, role: form.role };
        if (form.password) body.password = form.password;
        return UsersApi.update(editing.id, body);
      }
      return UsersApi.create(form);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); show(editing ? 'Staff updated' : 'Staff added'); setOpen(false); },
    onError: (e) => show(apiError(e), 'error'),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => UsersApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); show('Staff deactivated'); },
    onError: (e) => show(apiError(e), 'error'),
  });

  const openCreate = () => { setEditing(null); setForm({ name: '', email: '', password: '', role: 'CASHIER' }); setOpen(true); };
  const openEdit = (u: AppUser) => { setEditing(u); setForm({ name: u.name, email: u.email, password: '', role: u.role }); setOpen(true); };

  return (
    <div>
      <PageHeader title="Staff" description="Team members and their roles."
        action={<Button onClick={openCreate}><Plus className="h-4 w-4" /> Add staff</Button>} />

      {isLoading ? <LoadingBlock /> :
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
                      <Button size="icon" variant="ghost" onClick={() => openEdit(u)} aria-label={`Edit ${u.name}`}><Pencil className="h-4 w-4" /></Button>
                      {u.id !== me?.id && u.isActive && (
                        <Button size="icon" variant="ghost" aria-label={`Deactivate ${u.name}`} onClick={() => setDeactivateTarget(u)}>
                          <UserX className="h-4 w-4 text-destructive" /></Button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}

      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? 'Edit staff' : 'Add staff'}>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required autoFocus /></Field>
          <Field label="Email">
            <Input type="email" value={form.email} disabled={!!editing}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
          </Field>
          <Field label={editing ? 'New password (leave blank to keep)' : 'Password'}>
            <PasswordInput value={form.password} minLength={editing ? undefined : 8}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required={!editing} />
          </Field>
          <Field label="Role">
            <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>{editing ? 'Save' : 'Add'}</Button>
          </DialogFooter>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!deactivateTarget}
        title="Deactivate staff"
        description={deactivateTarget ? `Deactivate ${deactivateTarget.name}? They won't be able to sign in.` : undefined}
        confirmLabel="Deactivate"
        loading={deactivate.isPending}
        onConfirm={() => {
          if (deactivateTarget) deactivate.mutate(deactivateTarget.id);
        }}
        onCancel={() => setDeactivateTarget(null)}
      />
    </div>
  );
}
