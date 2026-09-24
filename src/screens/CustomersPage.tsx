'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Users, HandCoins, FileText } from 'lucide-react';
import { CustomersApi } from '@/api';
import { useStoreScope } from '@/store/StoreContext';
import type { Customer, PaymentMethod } from '@/types';
import { useCrudResource } from '@/hooks/useCrudResource';
import { PageHeader, LoadingBlock, EmptyState, ErrorState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { useToast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { apiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { SETTLE_METHODS } from '@/lib/payment-methods';
import { CustomerStatementDialog } from '@/components/CustomerStatementDialog';
import { TillPicker, useTillChoice } from '@/components/TillPicker';
import { useAuth } from '@/auth/AuthContext';
import { can } from '@/lib/permissions';

const emptyForm = { name: '', phone: '', email: '', address: '' };
type CustomerForm = typeof emptyForm;

export default function CustomersPage() {
  const { user } = useAuth();
  const canDelete = !!user && can.deleteCustomers(user.role);
  const [page, setPage] = useState(1);
  // A customer record is business-wide; this narrows the list to the ones who
  // have actually bought at the branch chosen in the header.
  const { storeId } = useStoreScope();
  const [prevStore, setPrevStore] = useState(storeId);
  if (prevStore !== storeId) {
    setPrevStore(storeId);
    setPage(1);
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['customers', page, storeId],
    queryFn: () => CustomersApi.list({ page, limit: 20, storeId: storeId || undefined }),
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

  const creditPayment = useCreditPayment(storeId);
  const [statementFor, setStatementFor] = useState<Customer | null>(null);

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
        <>
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
                      <Tooltip content="Account statement">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Account statement for ${customer.name}`}
                          onClick={() => setStatementFor(customer)}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      </Tooltip>
                      {due > 0 && (
                        <Tooltip content="Record payment">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Record payment for ${customer.name}`}
                            onClick={() => creditPayment.open(customer)}
                          >
                            <HandCoins className="h-4 w-4 text-success" />
                          </Button>
                        </Tooltip>
                      )}
                      <Tooltip content="Edit">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEditDialog(customer)}
                          aria-label={`Edit ${customer.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Tooltip>
                      {canDelete && (
                        <Tooltip content="Remove">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => crud.setRemoveTarget(customer)}
                            aria-label={`Remove ${customer.name}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </Tooltip>
                      )}
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        {data && <Pagination page={data.meta.page} pages={data.meta.pages} onPage={setPage} />}
        </>
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

      {statementFor && (
        <CustomerStatementDialog customer={statementFor} onClose={() => setStatementFor(null)} />
      )}

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
          <Field label="Paid by">
            <Select
              value={creditPayment.method}
              onChange={(e) => creditPayment.setMethod(e.target.value as PaymentMethod)}
            >
              {SETTLE_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </Select>
          </Field>
          <TillPicker choice={creditPayment.till} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={creditPayment.close}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={creditPayment.isPending}
              disabled={
                creditPayment.amount <= 0 ||
                (creditPayment.till.needsChoice && !creditPayment.till.shiftId)
              }
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

/**
 * Record-a-credit-payment flow: separate from the CRUD dialog since it targets
 * a different endpoint. `storeId` is the branch in the header -- where the
 * money was taken -- so cash lands in that branch's open till.
 */
function useCreditPayment(storeId: string) {
  const qc = useQueryClient();
  const { show } = useToast();
  const [target, setTarget] = useState<Customer | null>(null);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const till = useTillChoice(storeId, method, !!target);

  const pay = useMutation({
    mutationFn: () =>
      CustomersApi.payCredit(target!.id, amount, {
        method,
        storeId: storeId || undefined,
        shiftId: till.shiftId ?? undefined,
      }),
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
    method,
    setMethod,
    till,
    isPending: pay.isPending,
    open: (customer: Customer) => {
      setTarget(customer);
      setAmount(Number(customer.creditBalance));
      setMethod('CASH');
    },
    close: () => setTarget(null),
    submit: () => pay.mutate(),
  };
}
