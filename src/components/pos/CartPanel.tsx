'use client';
import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Pause,
  RotateCcw,
  ShoppingCart,
  Tag,
  Trash2,
  User,
  X,
} from 'lucide-react';
import type { Customer, Product, SaleListItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { RxBadge } from '@/components/ui/RxBadge';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tooltip } from '@/components/ui/tooltip';
import { formatMoney } from '@/lib/format';
import { hasDuplicateSerials, serialsInvalid } from '@/lib/serials';
import { cn } from '@/lib/utils';
import { CustomerPicker, type CustomerPickerHandle } from '@/components/pos/CustomerPicker';
import { CartLineRow, type LineEditor } from '@/components/pos/CartLineRow';

export interface CartLine {
  product: Product;
  quantity: number;
  /** Manual price override for this line; undefined = use product.sellingPrice. */
  unitPrice?: number;
  /** Absolute discount amount for this line (already resolved from % if that mode was used). */
  discount?: number;
  /** Serial/IMEI of each unit being sold; required at checkout when product.trackSerials. */
  serials?: string[];
}

/** Effective per-unit price for a line, after any manual override. */
export const lineUnitPrice = (l: CartLine) => l.unitPrice ?? Number(l.product.sellingPrice);

/** Net total for a line: unit price × quantity, less its discount, floored at 0. */
export const lineNet = (l: CartLine) =>
  Math.max(0, lineUnitPrice(l) * l.quantity - (l.discount ?? 0));

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
  /** Whether a shift is currently open -- checkout is blocked without one. */
  shiftOpen: boolean;
  heldSales: SaleListItem[];
  resumingId: string | null;
  discardingId: string | null;
  /** The chosen customer, if any. Resolved by the POS from `customerId`. */
  selectedCustomer?: Customer;
  customerId: string;
  onCustomerChange: (id: string) => void;
  onSetQty: (id: string, qty: number) => void;
  onUpdateLine: (id: string, updates: { unitPrice?: number; discount?: number; serials?: string[] }) => void;
  atMax: (line: CartLine) => boolean;
  onHold: () => void;
  holding: boolean;
  onResumeHeld: (id: string) => void;
  onDiscardHeld: (id: string) => void;
  onClear: () => void;
  onCheckout: () => void;
  checkingOut: boolean;
  subtotal: number;
  tax: number;
  /** Prices include tax, so the tax row is part of the subtotal's lines, not extra. */
  taxInclusive?: boolean;
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
  shiftOpen,
  heldSales,
  resumingId,
  discardingId,
  selectedCustomer,
  customerId,
  onCustomerChange,
  onSetQty,
  onUpdateLine,
  atMax,
  onHold,
  holding,
  onResumeHeld,
  onDiscardHeld,
  onClear,
  onCheckout,
  checkingOut,
  subtotal,
  tax,
  taxInclusive = false,
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
  // Which line has an inline editor open, and which one -- price/discount or
  // serials, never both and never on two lines at once. The drafts themselves
  // live in CartLineRow, so typing in an editor no longer re-renders the cart.
  const [editorId, setEditorId] = useState<string | null>(null);
  const [editor, setEditor] = useState<LineEditor | null>(null);
  // A cash sale still posts as fully paid even if less was physically
  // tendered (see isCashFull below) -- gate that specific case behind an
  // explicit confirmation instead of letting it complete silently.
  const [confirmShortTender, setConfirmShortTender] = useState(false);

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

  // Cash tendered → change due (the highest-frequency operation at the
  // counter). Only meaningful for a full cash sale; tendered itself is never
  // sent to the server -- a full sale always posts amountPaid: undefined.
  const isCashFull = payMode === 'full' && paymentMethod === 'CASH';
  const change = Math.round((tendered - total) * 100) / 100;

  const missingSerials = (l: CartLine) =>
    l.product.trackSerials && serialsInvalid(l.serials ?? [], l.quantity);

  /** The warning a line shows under itself, or null when its serials are fine. */
  const serialWarning = (l: CartLine) =>
    !missingSerials(l)
      ? null
      : hasDuplicateSerials(l.serials ?? [])
        ? 'Duplicate serial numbers entered'
        : `${l.serials?.length ?? 0} of ${l.quantity} serials entered`;

  const checkoutDisabled =
    !shiftOpen ||
    (due > 0 && !customerId) ||
    (needsRx && !prescriptionRef.trim()) ||
    cart.some(missingSerials);

  // Same condition that already drives the "Short by" warning below --
  // amountPaid always posts as the full total regardless of tendered, so
  // this is the one case checkout would otherwise complete silently short.
  const isShortTender = isCashFull && tendered > 0 && change < 0;
  const attemptCheckout = () => {
    if (isShortTender) setConfirmShortTender(true);
    else onCheckout();
  };

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
          'flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden rounded-2xl border border-border bg-card shadow-sm transition-colors',
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
          <Tooltip content="Clear cart">
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9 rounded-full text-muted-foreground hover:bg-accent lg:ml-auto lg:h-7 lg:w-7"
              onClick={onClear}
              aria-label="Clear cart"
            >
              <X className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>

        {heldSales.length > 0 && (
          <div className="shrink-0 border-b border-warning/40 bg-warning/10">
            <div className="flex items-center gap-2 px-3 py-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              <p className="text-xs font-medium text-foreground">
                {heldSales.length} sale{heldSales.length !== 1 ? 's' : ''} on hold
              </p>
            </div>
            <ul className="max-h-32 divide-y divide-warning/20 overflow-y-auto">
              {heldSales.map((s) => (
                <li key={s.id} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                    {s.customer?.name ?? 'Walk-in'} · {s._count?.items ?? 0} item
                    {(s._count?.items ?? 0) !== 1 ? 's' : ''}
                  </span>
                  <span className="shrink-0 text-xs font-medium text-foreground">
                    {formatMoney(s.total)}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 shrink-0 border-warning/50 px-2 text-[11px] text-warning hover:bg-warning/10"
                    loading={resumingId === s.id}
                    onClick={() => onResumeHeld(s.id)}
                  >
                    <RotateCcw className="h-3 w-3" /> Resume
                  </Button>
                  <Tooltip content="Discard held sale">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Discard held sale"
                      loading={discardingId === s.id}
                      onClick={() => onDiscardHeld(s.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </Tooltip>
                </li>
              ))}
            </ul>
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
              <CartLineRow
                key={l.product.id}
                line={l}
                isLast={i === cart.length - 1}
                lastItemRef={lastItemRef}
                atMax={atMax(l)}
                serialWarning={serialWarning(l)}
                menuOpen={menuId === l.product.id}
                onMenuOpenChange={(open) => setMenuId(open ? l.product.id : null)}
                editor={editorId === l.product.id ? editor : null}
                onEditorChange={(next) => {
                  setEditor(next);
                  setEditorId(next ? l.product.id : null);
                }}
                onSetQty={onSetQty}
                onUpdateLine={onUpdateLine}
              />
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
              <div className="shrink-0 max-h-[42vh] overflow-y-auto border-t border-border">
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
                    selectedCustomer={selectedCustomer}
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
                <span>{taxInclusive ? 'Tax (included)' : 'Tax'}</span>
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
                          attemptCheckout();
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
                <Button variant="outline" className="flex-1" loading={holding} onClick={onHold}>
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
                onClick={attemptCheckout}
              >
                <Check className="h-4 w-4" /> Complete Sale · {formatMoney(total)}
              </Button>
              {!shiftOpen && (
                <p className="text-center text-xs text-destructive">
                  Open a shift to start selling.
                </p>
              )}
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

      <ConfirmDialog
        open={confirmShortTender}
        title="Tendered amount is short"
        description={`Only ${formatMoney(tendered)} tendered against a total of ${formatMoney(total)} — short by ${formatMoney(-change)}. Completing anyway records this sale as paid in full.`}
        confirmLabel="Complete anyway"
        destructive={false}
        loading={checkingOut}
        onConfirm={() => {
          setConfirmShortTender(false);
          onCheckout();
        }}
        onCancel={() => setConfirmShortTender(false)}
      />
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
