'use client';
import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Minus,
  MoreVertical,
  Package,
  Pause,
  Plus,
  RotateCcw,
  ShoppingCart,
  Tag,
  Trash2,
  User,
  X,
} from 'lucide-react';
import type { Customer, Product } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { RxBadge } from '@/components/ui/RxBadge';
import { Card } from '@/components/ui/card';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CustomerPicker, type CustomerPickerHandle } from '@/components/pos/CustomerPicker';

export interface CartLine {
  product: Product;
  quantity: number;
}

export type PayMode = 'full' | 'partial' | 'credit';
export type DiscountType = 'amount' | 'percent';

export const PAY_MODES = [
  { value: 'full', label: 'Paid in full' },
  { value: 'partial', label: 'Partial' },
  { value: 'credit', label: 'Credit' },
] as const;

export const TENDERS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'MOBILE', label: 'Mobile' },
] as const;

/** Common note denominations for quick-tender buttons. */
const QUICK_NOTES = [100, 500, 1000];

interface CartPanelProps {
  cart: CartLine[];
  cartCount: number;
  heldCart: CartLine[] | null;
  customers: Customer[];
  customerId: string;
  onCustomerChange: (id: string) => void;
  onSetQty: (id: string, qty: number) => void;
  atMax: (line: CartLine) => boolean;
  onHold: () => void;
  onResume: () => void;
  onClear: () => void;
  onCheckout: () => void;
  checkingOut: boolean;
  subtotal: number;
  tax: number;
  total: number;
  paidNow: number;
  due: number;
  discount: number;
  discountAmount: number;
  onDiscountChange: (n: number) => void;
  discountType: DiscountType;
  onDiscountTypeChange: (t: DiscountType) => void;
  payMode: PayMode;
  onPayModeChange: (m: PayMode) => void;
  paymentMethod: string;
  onPaymentMethodChange: (m: string) => void;
  amountPaid: number;
  onAmountPaidChange: (n: number) => void;
  /** Cash tendered for a full CASH sale -- purely local, drives the change-due display. */
  tendered: number;
  onTenderedChange: (n: number) => void;
  /** Snapshot of the last completed cash sale's tendered/change, shown until the next item is added. */
  lastChange: { tendered: number; change: number } | null;
  needsRx: boolean;
  prescriptionRef: string;
  onPrescriptionRefChange: (s: string) => void;
  /** Mobile only — closes the slide-up sheet this panel lives in. */
  onClose?: () => void;
}

export function CartPanel({
  cart,
  cartCount,
  heldCart,
  customers,
  customerId,
  onCustomerChange,
  onSetQty,
  atMax,
  onHold,
  onResume,
  onClear,
  onCheckout,
  checkingOut,
  subtotal,
  tax,
  total,
  paidNow,
  due,
  discount,
  discountAmount,
  onDiscountChange,
  discountType,
  onDiscountTypeChange,
  payMode,
  onPayModeChange,
  paymentMethod,
  onPaymentMethodChange,
  amountPaid,
  onAmountPaidChange,
  tendered,
  onTenderedChange,
  lastChange,
  needsRx,
  prescriptionRef,
  onPrescriptionRefChange,
  onClose,
}: CartPanelProps) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const [showDiscount, setShowDiscount] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const cartScrollRef = useRef<HTMLUListElement>(null);
  const lastItemRef = useRef<HTMLLIElement>(null);
  const prevItemCountRef = useRef(0);
  const customerPickerRef = useRef<CustomerPickerHandle>(null);

  // Reveal a newly added line only when the cart is already at/near the
  // bottom. Reviewing payment details or earlier lines is never interrupted.
  useEffect(() => {
    const added = cart.length > prevItemCountRef.current;
    prevItemCountRef.current = cart.length;
    if (!added || cart.length === 0) return;
    const el = cartScrollRef.current;
    const last = lastItemRef.current;
    if (!el || !last) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 40) return;
    const elRect = el.getBoundingClientRect();
    const liRect = last.getBoundingClientRect();
    el.scrollTo({
      top: Math.max(0, el.scrollTop + (liRect.bottom - elRect.bottom)),
      behavior: 'smooth',
    });
  }, [cart]);

  const selectedCustomer = customers.find((c) => c.id === customerId);

  // Cash tendered → change due (the highest-frequency operation at the
  // counter). Only meaningful for a full cash sale; tendered itself is never
  // sent to the server -- a full sale always posts amountPaid: undefined.
  const isCashFull = payMode === 'full' && paymentMethod === 'CASH';
  const change = Math.round((tendered - total) * 100) / 100;

  const checkoutDisabled =
    (due > 0 && !customerId) || (needsRx && !prescriptionRef.trim());

  const tenderLabel = TENDERS.find((t) => t.value === paymentMethod)?.label ?? paymentMethod;

  const paySummary =
    payMode === 'credit'
      ? 'On credit'
      : payMode === 'partial'
        ? `Partial · ${formatMoney(paidNow)} paid`
        : `Paid in full · ${tenderLabel}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:w-full">
      <Card
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-colors',
          cartCount > 0 ? 'border-primary/40' : 'border-border hover:border-primary/40',
        )}
      >
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
          <ShoppingCart className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold tracking-tight text-foreground">Cart</h2>
          <span className="text-xs text-muted-foreground">
            {cartCount} item{cartCount !== 1 ? 's' : ''}
          </span>
          {onClose && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-7 rounded-full px-3 text-xs lg:hidden"
              onClick={onClose}
            >
              Done
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 rounded-full text-muted-foreground hover:bg-accent lg:ml-auto"
            onClick={onClear}
            aria-label="Clear cart"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {heldCart && cart.length === 0 && (
          <div className="flex shrink-0 items-center gap-2 border-b border-warning/40 bg-warning/10 px-3 py-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
            <p className="flex-1 text-xs font-medium text-foreground">A sale is on hold</p>
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-warning/50 text-warning hover:bg-warning/10"
              onClick={onResume}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Resume
            </Button>
          </div>
        )}

        {/* Product list — the only scrollable area */}
        {cart.length === 0 ? (
          lastChange ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
                <Check className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-foreground">Sale complete</p>
              <div className="w-full max-w-[220px] space-y-1 rounded-lg border border-success/30 bg-success/5 px-4 py-3">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Tendered</span>
                  <span>{formatMoney(lastChange.tendered)}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-foreground">Change due</span>
                  <span className="text-2xl font-bold tracking-tight text-success">
                    {formatMoney(lastChange.change)}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Scan the next item to start a new sale.</p>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <ShoppingCart className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-foreground">Your cart is empty</p>
              <p className="text-xs text-muted-foreground">Tap a product on the left to add it.</p>
            </div>
          )
        ) : (
          <ul
            ref={cartScrollRef}
            className="min-h-0 flex-1 divide-y divide-border overflow-y-auto [overflow-anchor:none]"
          >
            {cart.map((l, i) => (
              <li
                key={l.product.id}
                ref={i === cart.length - 1 ? lastItemRef : undefined}
                className="flex items-center gap-2 px-3 py-2"
              >
                {l.product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={l.product.imageUrl}
                    alt={l.product.name}
                    className="h-10 w-10 shrink-0 rounded-md border border-border object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                    <Package className="h-4 w-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {l.product.name}
                    </span>
                    {l.product.isRxRequired && <RxBadge />}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {l.product.sku || l.product.unit}
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      aria-label={`Decrease quantity of ${l.product.name}`}
                      onClick={() => onSetQty(l.product.id, l.quantity - 1)}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <QtyInput value={l.quantity} onCommit={(q) => onSetQty(l.product.id, q)} />
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      aria-label={`Increase quantity of ${l.product.name}`}
                      disabled={atMax(l)}
                      onClick={() => onSetQty(l.product.id, l.quantity + 1)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="whitespace-nowrap text-sm font-semibold text-foreground">
                    {formatMoney(Number(l.product.sellingPrice) * l.quantity)}
                  </span>
                  <div className="relative">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
                      aria-label={`More options for ${l.product.name}`}
                      onClick={() => setMenuId(menuId === l.product.id ? null : l.product.id)}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                    {menuId === l.product.id && (
                      <>
                        <div className="fixed inset-0 z-20" onClick={() => setMenuId(null)} />
                        <div className="absolute right-0 top-8 z-30 w-36 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-md">
                          <button
                            onClick={() => {
                              setMenuId(null);
                              onSetQty(l.product.id, 0);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-destructive hover:bg-muted"
                          >
                            <Trash2 className="h-4 w-4" /> Remove item
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Fixed lower section: summary, actions, and collapsible details */}
        {cart.length > 0 && (
          <>
            {/* Details toggle — collapsed by default so the cart list stays roomy */}
            <button
              type="button"
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen((o) => !o)}
              className="flex shrink-0 w-full items-center gap-2 border-t border-border px-4 py-2.5 transition-colors hover:bg-muted/50"
            >
              <User className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground">
                {selectedCustomer ? selectedCustomer.name : 'Walk-in Customer'}
              </span>
              {discountAmount > 0 && (
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {discountType === 'percent' ? `${discount}%` : formatMoney(discountAmount)} off
                </span>
              )}
              <span className="shrink-0 text-xs text-muted-foreground">{paySummary}</span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                  detailsOpen && 'rotate-180',
                )}
              />
            </button>

            {detailsOpen && (
              <div className="min-h-0 max-h-[42vh] overflow-y-auto border-t border-border">
                {/* Customer */}
                <div className="px-4 py-3">
                  <p className="mb-1.5 text-sm font-medium text-foreground">
                    Customer
                    {payMode === 'credit' && (
                      <span className="text-destructive"> (required)</span>
                    )}
                  </p>
                  <CustomerPicker
                    ref={customerPickerRef}
                    customers={customers}
                    customerId={customerId}
                    onCustomerChange={onCustomerChange}
                    required={payMode === 'credit'}
                  />
                </div>

            {/* Payment */}
            <div className="space-y-3 border-t border-border px-4 py-3">
              <div>
                <p className="mb-1.5 text-sm font-medium text-foreground">Payment</p>
                <Segment
                  value={payMode}
                  options={PAY_MODES}
                  onChange={(v) => onPayModeChange(v as PayMode)}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {payMode !== 'credit' && (
                  <Field label="Tender">
                    <Select
                      value={paymentMethod}
                      onChange={(e) => onPaymentMethodChange(e.target.value)}
                    >
                      {TENDERS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                {payMode === 'partial' && (
                  <Field label="Amount paid">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max={total}
                      value={amountPaid}
                      onChange={(e) =>
                        onAmountPaidChange(Math.min(Math.max(Number(e.target.value) || 0, 0), total))
                      }
                    />
                  </Field>
                )}
                {payMode === 'credit' && (
                  <p className="col-span-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
                    Customer will be charged{' '}
                    <span className="font-semibold text-primary">{formatMoney(total)}</span> on
                    credit.
                  </p>
                )}
              </div>

              {needsRx && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      Prescription required
                    </span>
                    <RxBadge className="ml-auto" />
                  </div>
                  <Field label="Prescription reference">
                    <Input
                      value={prescriptionRef}
                      onChange={(e) => onPrescriptionRefChange(e.target.value)}
                      placeholder="Rx number"
                    />
                  </Field>
                  <p className="pt-1.5 text-xs text-muted-foreground">
                    Required for:{' '}
                    {cart
                      .filter((l) => l.product.isRxRequired)
                      .map((l) => l.product.name)
                      .join(', ')}
                    .
                  </p>
                </div>
              )}

              {showDiscount || discount > 0 ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Type">
                      <Select
                        value={discountType}
                        onChange={(e) => onDiscountTypeChange(e.target.value as DiscountType)}
                      >
                        <option value="amount">Amount</option>
                        <option value="percent">Percentage</option>
                      </Select>
                    </Field>
                    <Field label={discountType === 'percent' ? 'Percent %' : 'Amount'}>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max={discountType === 'percent' ? 100 : undefined}
                        value={discount}
                        onChange={(e) => onDiscountChange(Number(e.target.value) || 0)}
                      />
                    </Field>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Discount applied:{' '}
                      <span className="font-medium text-foreground">
                        {formatMoney(discountAmount)}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => {
                        onDiscountChange(0);
                        setShowDiscount(false);
                      }}
                    >
                      <X className="h-4 w-4" /> Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDiscount(true)}
                  className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <Tag className="h-4 w-4" /> Add discount
                </button>
              )}
            </div>
              </div>
            )}

            {/* Summary */}
            <div className="shrink-0 space-y-1.5 border-t border-border px-4 py-3">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatMoney(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Discount</span>
                  <span>- {formatMoney(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Tax</span>
                <span>{formatMoney(tax)}</span>
              </div>
              <div className="flex items-baseline justify-between border-t border-border pt-2">
                <span className="text-base font-semibold text-foreground">Total</span>
                <span className="text-2xl font-bold tracking-tight text-primary">
                  {formatMoney(total)}
                </span>
              </div>

              {isCashFull && (
                <div className="space-y-2 border-t border-border pt-2">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      aria-label="Amount tendered"
                      placeholder="Amount tendered"
                      className="h-9"
                      value={tendered || ''}
                      onChange={(e) => onTenderedChange(Math.max(0, Number(e.target.value) || 0))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !checkoutDisabled) {
                          e.preventDefault();
                          onCheckout();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 shrink-0"
                      onClick={() => onTenderedChange(total)}
                    >
                      Exact
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_NOTES.map((n) => (
                      <Button
                        key={n}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9"
                        onClick={() => onTenderedChange(n)}
                      >
                        {formatMoney(n)}
                      </Button>
                    ))}
                  </div>
                  {tendered > 0 &&
                    (change >= 0 ? (
                      <div className="flex items-baseline justify-between rounded-md bg-success/10 px-3 py-2">
                        <span className="text-sm font-semibold text-success">Change due</span>
                        <span className="text-2xl font-bold tracking-tight text-success">
                          {formatMoney(change)}
                        </span>
                      </div>
                    ) : (
                      <p className="text-right text-xs font-medium text-destructive">
                        Short by {formatMoney(-change)}
                      </p>
                    ))}
                </div>
              )}

              {payMode === 'partial' && paidNow > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Paid</span>
                  <span>{formatMoney(paidNow)}</span>
                </div>
              )}
              {due > 0 && (
                <div className="flex justify-between text-sm font-medium text-destructive">
                  <span>{payMode === 'credit' ? 'Due on Credit' : 'Remaining'}</span>
                  <span>{formatMoney(due)}</span>
                </div>
              )}
            </div>

            {/* Action bar */}
            <div className="shrink-0 space-y-2 border-t border-border bg-muted/40 p-4">
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={onHold}>
                  <Pause className="h-4 w-4" /> Hold
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={onClear}
                >
                  <Trash2 className="h-4 w-4" /> Clear
                </Button>
              </div>

              <Button
                className="h-12 w-full text-base"
                loading={checkingOut}
                disabled={checkoutDisabled}
                onClick={onCheckout}
              >
                <Check className="h-4 w-4" /> Complete Sale · {formatMoney(total)}
              </Button>
              {due > 0 && !customerId && (
                <div className="flex items-center justify-center gap-1.5 text-center text-xs text-destructive">
                  <span>Select a customer to leave a balance on credit.</span>
                  <button
                    type="button"
                    onClick={() => customerPickerRef.current?.openAdd()}
                    className="font-medium underline underline-offset-2 hover:text-destructive/80"
                  >
                    + Add customer
                  </button>
                </div>
              )}
              {needsRx && !prescriptionRef.trim() && (
                <p className="text-center text-xs text-destructive">
                  Enter a prescription reference to continue.
                </p>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

/** Pill-style segmented control, more register-like than a dropdown. */
function Segment<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex h-11 rounded-lg border border-border bg-muted/50 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 rounded-md px-2 text-sm font-medium transition-colors',
            value === o.value
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Live-editable quantity: safe to clear while typing, commits on blur/Enter. */
function QtyInput({ value, onCommit }: { value: number; onCommit: (q: number) => void }) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(String(value));
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label="Quantity"
      className="h-7 w-10 rounded border border-input bg-background text-center text-sm"
      value={focused ? draft : String(value)}
      onFocus={(e) => {
        setDraft(String(value));
        setFocused(true);
        e.target.select();
      }}
      onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={() => {
        setFocused(false);
        onCommit(parseInt(draft || '0', 10) || 0);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}