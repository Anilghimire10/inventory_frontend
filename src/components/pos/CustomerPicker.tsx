'use client';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Plus, Search, User } from 'lucide-react';
import { CustomersApi } from '@/api';
import type { Customer, Paginated } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface CustomerPickerHandle {
  /** Opens the "add customer" dialog, prefilling name/phone from a search query when given. */
  openAdd: (initialQuery?: string) => void;
}

interface CustomerPickerProps {
  customers: Customer[];
  customerId: string;
  onCustomerChange: (id: string) => void;
  /** Styles the trigger to flag that a customer must be picked (credit sales). */
  required?: boolean;
}

/** Search-to-select customer dropdown with inline "add new customer" creation. */
export const CustomerPicker = forwardRef<CustomerPickerHandle, CustomerPickerProps>(
  function CustomerPicker({ customers, customerId, onCustomerChange, required }, ref) {
    const qc = useQueryClient();
    const { show } = useToast();

    const [custOpen, setCustOpen] = useState(false);
    const [custQuery, setCustQuery] = useState('');
    const [addCustomerOpen, setAddCustomerOpen] = useState(false);
    const [newCustomerName, setNewCustomerName] = useState('');
    const [newCustomerPhone, setNewCustomerPhone] = useState('');

    // Dropdown is portaled to <body> so its "Add new customer" footer stays
    // visible and is never clipped by the cart's scroll containers.
    const custButtonRef = useRef<HTMLButtonElement>(null);
    const [custRect, setCustRect] = useState<{
      top: number;
      left: number;
      width: number;
      listMax: number;
    } | null>(null);

    useEffect(() => {
      if (!custOpen) return;
      const update = () => {
        const el = custButtonRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const top = r.bottom + 4;
        // Keep the whole dropdown on screen: reserve space for the search bar
        // and the sticky "Add new customer" footer, cap the list at 12rem.
        const listMax = Math.max(96, Math.min(192, window.innerHeight - top - 110));
        const width = Math.min(r.width, window.innerWidth - 32);
        const left = Math.max(16, Math.min(r.left, window.innerWidth - width - 16));
        setCustRect({ top, left, width, listMax });
      };
      update();
      window.addEventListener('resize', update);
      window.addEventListener('scroll', update, true);
      return () => {
        window.removeEventListener('resize', update);
        window.removeEventListener('scroll', update, true);
      };
    }, [custOpen]);

    const selectedCustomer = customers.find((c) => c.id === customerId);

    const customerOptions = useMemo(() => {
      const q = custQuery.trim().toLowerCase();
      if (!q) return customers;
      return customers.filter(
        (c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').toLowerCase().includes(q),
      );
    }, [customers, custQuery]);

    const openAddCustomer = (initialQuery?: string) => {
      const q = (initialQuery ?? custQuery).trim();
      if (q) {
        // If it looks like a phone number (mostly digits), prefill phone, else prefill name.
        if (/^[\d+\-\s()]{5,}$/.test(q)) {
          setNewCustomerPhone(q);
          setNewCustomerName('');
        } else {
          setNewCustomerName(q);
          setNewCustomerPhone('');
        }
      } else {
        setNewCustomerName('');
        setNewCustomerPhone('');
      }
      setCustOpen(false);
      setCustQuery('');
      setAddCustomerOpen(true);
    };

    useImperativeHandle(ref, () => ({ openAdd: openAddCustomer }));

    const createCustomer = useMutation({
      mutationFn: (body: { name: string; phone?: string }) => CustomersApi.create(body),
      onSuccess: (c) => {
        // Optimistically insert the new customer into the cache so selectedCustomer resolves immediately.
        qc.setQueryData<Paginated<Customer>>(['customers'], (old) => {
          if (!old) return { data: [c], meta: { total: 1, page: 1, limit: 100, pages: 1 } };
          return {
            ...old,
            data: [c, ...(old.data || [])],
            meta: {
              ...old.meta,
              total: (old.meta?.total || old.data.length) + 1,
              page: old.meta?.page || 1,
              limit: old.meta?.limit || 100,
              pages: old.meta?.pages || 1,
            },
          };
        });
        qc.invalidateQueries({ queryKey: ['customers'] });
        onCustomerChange(c.id);
        setAddCustomerOpen(false);
        setNewCustomerName('');
        setNewCustomerPhone('');
        show(`Customer "${c.name}" added`);
      },
      onError: (e) => show(apiError(e), 'error'),
    });

    return (
      <>
        <div className="relative">
          <button
            ref={custButtonRef}
            type="button"
            onClick={() => setCustOpen((o) => !o)}
            className={cn(
              'flex h-10 w-full items-center gap-2 rounded-md border bg-card px-3 text-sm transition-colors',
              required
                ? 'border-primary/50 bg-primary/5 text-foreground'
                : 'border-border text-foreground hover:border-primary/40',
            )}
          >
            <User className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-left">
              {selectedCustomer ? selectedCustomer.name : 'Walk-in Customer'}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
          {custOpen &&
            custRect &&
            createPortal(
              <>
                <div className="fixed inset-0 z-[60]" onClick={() => setCustOpen(false)} />
                <div
                  className="fixed z-[61] mt-1 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
                  style={{ top: custRect.top, left: custRect.left, width: custRect.width }}
                >
                  <div className="relative border-b border-border">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      autoFocus
                      value={custQuery}
                      onChange={(e) => setCustQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (customerOptions.length === 1) {
                            onCustomerChange(customerOptions[0].id);
                            setCustOpen(false);
                            setCustQuery('');
                          } else if (customerOptions.length === 0 && custQuery.trim()) {
                            openAddCustomer(custQuery.trim());
                          }
                        }
                      }}
                      placeholder="Search by name or phone…"
                      aria-label="Search customers by name or phone"
                      className="h-10 w-full bg-transparent pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none"
                    />
                  </div>
                  <ul className="overflow-y-auto py-1" style={{ maxHeight: custRect.listMax }}>
                    <li>
                      <button
                        type="button"
                        onClick={() => {
                          onCustomerChange('');
                          setCustOpen(false);
                          setCustQuery('');
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted',
                          customerId === '' && 'bg-muted/60',
                        )}
                      >
                        <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 text-left">Walk-in Customer</span>
                      </button>
                    </li>
                    {customerOptions.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onCustomerChange(c.id);
                            setCustOpen(false);
                            setCustQuery('');
                          }}
                          className={cn(
                            'flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted',
                            c.id === customerId && 'bg-muted/60',
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate text-left">{c.name}</span>
                          {c.phone && (
                            <span className="text-xs text-muted-foreground">{c.phone}</span>
                          )}
                        </button>
                      </li>
                    ))}
                    {customerOptions.length === 0 && custQuery.trim() !== '' && (
                      <li className="p-1">
                        <button
                          type="button"
                          onClick={() => openAddCustomer(custQuery.trim())}
                          className="flex w-full items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20"
                        >
                          <Plus className="h-4 w-4 shrink-0" />
                          <span className="truncate">Create &ldquo;{custQuery.trim()}&rdquo;</span>
                        </button>
                      </li>
                    )}
                  </ul>
                  <button
                    type="button"
                    onClick={() => openAddCustomer()}
                    className="sticky bottom-0 flex w-full items-center gap-2 border-t border-border bg-card px-3 py-2.5 text-sm font-medium text-primary hover:bg-muted"
                  >
                    <Plus className="h-4 w-4" /> Add new customer
                  </button>
                </div>
              </>,
              document.body,
            )}
        </div>

        <Dialog
          open={addCustomerOpen}
          onClose={() => setAddCustomerOpen(false)}
          title="Add new customer"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newCustomerName.trim()) return;
              createCustomer.mutate({
                name: newCustomerName.trim(),
                phone: newCustomerPhone.trim() || undefined,
              });
            }}
            className="space-y-4"
          >
            <Field label="Name">
              <Input
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                placeholder="Customer name"
                required
                autoFocus={!newCustomerName}
              />
            </Field>
            <Field label="Phone">
              <Input
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
                placeholder="Phone number"
                autoFocus={!!newCustomerName}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddCustomerOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={createCustomer.isPending}
                disabled={!newCustomerName.trim()}
              >
                Add customer
              </Button>
            </DialogFooter>
          </form>
        </Dialog>
      </>
    );
  },
);
