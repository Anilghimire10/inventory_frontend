'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Plus, Search, User } from 'lucide-react';
import { CustomersApi } from '@/api';
import type { Customer } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useDebounced } from '@/hooks/useDebounced';

/** How many matches the dropdown shows; past that, the cashier keeps typing. */
const PICK_LIMIT = 20;

/**
 * Cache key for one customer, as the POS resolves the selected one. The picker
 * seeds it on selection so choosing someone never costs a request; a resumed
 * held sale, which only carries the id, fetches it.
 */
export const customerKey = (id: string) => ['customers', 'one', id] as const;

export interface CustomerPickerHandle {
  /** Opens the "add customer" dialog, prefilling name/phone from a search query when given. */
  openAdd: (initialQuery?: string) => void;
}

interface CustomerPickerProps {
  /** The chosen customer, resolved by the caller from `customerId`. */
  selectedCustomer?: Customer;
  customerId: string;
  onCustomerChange: (id: string) => void;
  /** Styles the trigger to flag that a customer must be picked (credit sales). */
  required?: boolean;
}

/**
 * Search-to-select customer dropdown with inline "add new customer" creation.
 *
 * Searches on the server. It used to filter a list the POS loaded once with
 * `limit: 100`, sorted by name -- so once a shop had more than a hundred
 * customers, everyone past roughly "M" could not be found at the till, and the
 * cashier's only way forward was to create them again, splitting their khata
 * across two accounts.
 */
export const CustomerPicker = forwardRef<CustomerPickerHandle, CustomerPickerProps>(
  function CustomerPicker({ selectedCustomer, customerId, onCustomerChange, required }, ref) {
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

    const typed = custQuery.trim();
    const search = useDebounced(typed);
    const results = useQuery({
      queryKey: ['customers', 'search', search],
      queryFn: () => CustomersApi.list({ search: search || undefined, limit: PICK_LIMIT }),
      enabled: custOpen,
      placeholderData: keepPreviousData,
    });
    const customerOptions = results.data?.data ?? [];
    const moreThanShown = (results.data?.meta.total ?? 0) > customerOptions.length;
    // The list answers what is in the box, not a keystroke ago. "No match --
    // create them?" and Enter-to-pick both act on it, so neither may run on a
    // stale answer: that is how a duplicate customer gets made.
    const settled = search === typed && !results.isFetching;

    const pick = (c: Customer | null) => {
      if (c) qc.setQueryData(customerKey(c.id), c);
      onCustomerChange(c?.id ?? '');
      setCustOpen(false);
      setCustQuery('');
    };

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
        // Seed the selected-customer entry so the name shows immediately, and
        // drop cached searches so the new customer turns up in them.
        qc.setQueryData(customerKey(c.id), c);
        qc.invalidateQueries({ queryKey: ['customers', 'search'] });
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
                          if (!settled) return;
                          if (customerOptions.length === 1) {
                            pick(customerOptions[0]);
                          } else if (customerOptions.length === 0 && typed) {
                            openAddCustomer(typed);
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
                        onClick={() => pick(null)}
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
                          onClick={() => pick(c)}
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
                    {results.isPending && (
                      <li className="px-3 py-2 text-xs text-muted-foreground">Searching…</li>
                    )}
                    {results.isError && (
                      <li className="px-3 py-2 text-xs text-destructive">
                        Couldn&apos;t search customers. Check the connection and try again.
                      </li>
                    )}
                    {moreThanShown && (
                      <li className="px-3 py-2 text-xs text-muted-foreground">
                        Showing the first {customerOptions.length}. Keep typing to narrow it down.
                      </li>
                    )}
                    {settled && !results.isError && customerOptions.length === 0 && typed !== '' && (
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
