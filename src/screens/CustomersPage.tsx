'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Users, HandCoins } from 'lucide-react';
import { CustomersApi } from '@/api';
import type { Customer } from '@/types';
import { useCrudResource } from '@/hooks/useCrudResource';
import { PageHeader, LoadingBlock, EmptyState, ErrorState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useAuth } from '@/auth/AuthContext';
import { can } from '@/lib/permissions';

const emptyForm = { name: '', phone: '', email: '', address: '' };
type CustomerForm = typeof emptyForm;

export default function CustomersPage() {
  const { user } = useAuth();
  const canDelete = !!user && can.deleteCustomers(user.role);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['customers'],
    queryFn: () => CustomersApi.list({ limit: 100 }),
  });

  const crud = useCrudResource<Customer>({
    queryKey: ['customers'],
    api: CustomersApi,
    messages: {
      created: 'Customer added',
      updated: 'Customer updated',
      removed: 'Customer removed',
    },
  });

  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const setField = (key: keyof CustomerForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const openCreateDialog = () => {
    setForm(emptyForm);
    crud.openCreate();
  };
  const openEditDialog = (customer: Customer) => {
    setForm({
      name: customer.name,
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      address: customer.address ?? '',
    });
    crud.openEdit(customer);
  };
  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    crud.save.mutate({
      name: form.name,
      phone: form.phone || undefined,
      email: form.email || undefined,
      address: form.address || undefined,
    });
  };

  const creditPayment = useCreditPayment();

  const customers = data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Customer records and credit balances."
        action={
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4" /> Add customer
          </Button>
        }
      />

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : customers.length === 0 ? (
        <EmptyState
          title="No customers"
          description="Add customers to track purchases and credit."
          icon={Users}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Phone</TH>
              <TH>Email</TH>
              <TH className="text-right">Credit due</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {customers.map((customer) => {
              const due = Number(customer.creditBalance);
              return (
                <TR key={customer.id}>
                  <TD className="font-medium">{customer.name}</TD>
                  <TD>{customer.phone || '—'}</TD>
                  <TD className="text-muted-foreground">{customer.email || '—'}</TD>
                  <TD className="text-right">
                    {due > 0 ? (
                      <Badge tone="warning">{formatMoney(due)}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      {due > 0 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Record payment"
                          aria-label={`Record payment for ${customer.name}`}
                          onClick={() => creditPayment.open(customer)}
                        >
                          <HandCoins className="h-4 w-4 text-success" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEditDialog(customer)}
                        aria-label={`Edit ${customer.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {canDelete && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => crud.setRemoveTarget(customer)}
                          aria-label={`Remove ${customer.name}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}

      <Dialog
        open={crud.open}
        onClose={crud.close}
        title={crud.editing ? 'Edit customer' : 'New customer'}
      >
        <form onSubmit={submitForm} className="space-y-4">
          <Field label="Name">
            <Input value={form.name} onChange={setField('name')} required autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <Input value={form.phone} onChange={setField('phone')} />
            </Field>
            <Field label="Email (optional)">
              <Input type="email" value={form.email} onChange={setField('email')} />
            </Field>
          </div>
          <Field label="Address">
            <Input value={form.address} onChange={setField('address')} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={crud.close}>
              Cancel
            </Button>
            <Button type="submit" loading={crud.save.isPending}>
              {crud.editing ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      <Dialog
        open={creditPayment.isOpen}
        onClose={creditPayment.close}
        title="Record credit payment"
        description={creditPayment.target?.name}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            creditPayment.submit();
          }}
          className="space-y-4"
        >
          <p className="text-sm text-muted-foreground">
            Outstanding:{' '}
            <span className="font-medium text-foreground">
              {formatMoney(creditPayment.target?.creditBalance ?? 0)}
            </span>
          </p>
          <Field label="Amount received">
            <Input
              type="number"
              step="0.01"
              min="0"
              max={Number(creditPayment.target?.creditBalance ?? 0)}
              value={creditPayment.amount}
              onChange={(e) => creditPayment.setAmount(Number(e.target.value))}
              autoFocus
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={creditPayment.close}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={creditPayment.isPending}
              disabled={creditPayment.amount <= 0}
            >
              Record payment
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!crud.removeTarget}
        title="Remove customer"
        description={
          crud.removeTarget ? `Remove "${crud.removeTarget.name}" and their record?` : undefined
        }
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

/** Record-a-credit-payment flow: separate from the CRUD dialog since it targets a different endpoint. */
function useCreditPayment() {
  const qc = useQueryClient();
  const { show } = useToast();
  const [target, setTarget] = useState<Customer | null>(null);
  const [amount, setAmount] = useState(0);

  const pay = useMutation({
    mutationFn: () => CustomersApi.payCredit(target!.id, amount),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      show('Payment recorded');
      setTarget(null);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  return {
    target,
    isOpen: !!target,
    amount,
    setAmount,
    isPending: pay.isPending,
    open: (customer: Customer) => {
      setTarget(customer);
      setAmount(Number(customer.creditBalance));
    },
    close: () => setTarget(null),
    submit: () => pay.mutate(),
  };
}
