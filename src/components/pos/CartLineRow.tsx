'use client';
import { memo, useState, type RefObject } from 'react';
import {
  AlertTriangle,
  Hash,
  Minus,
  MoreVertical,
  Package,
  Plus,
  Tag,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { RxBadge } from '@/components/ui/RxBadge';
import { ExpiryBadge } from '@/components/ExpiryBadge';
import { Tooltip } from '@/components/ui/tooltip';
import { formatMoney, currencySymbol } from '@/lib/format';
import { SerialPicker } from '@/components/SerialPicker';
import { allowsFraction } from '@/lib/units';
import { lineNet, type CartLine, type DiscountType } from '@/components/pos/CartPanel';

/** Which inline editor a line has open, if any. */
export type LineEditor = 'price' | 'serials';

interface CartLineRowProps {
  line: CartLine;
  /** The last line gets the ref the panel scrolls to when an item is added. */
  isLast: boolean;
  lastItemRef: RefObject<HTMLLIElement | null>;
  /** Stock ceiling reached — the + button is dead. */
  atMax: boolean;
  /** Serial-entry warning to show under the line, or null when it's fine. */
  serialWarning: string | null;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  /** Editors are one-at-a-time across the whole cart, so the panel owns which. */
  editor: LineEditor | null;
  onEditorChange: (editor: LineEditor | null) => void;
  onSetQty: (id: string, qty: number) => void;
  /** The till's store, for the serial picker. */
  storeId: string | null;
  onUpdateLine: (
    id: string,
    updates: { unitPrice?: number; discount?: number; serials?: string[] },
  ) => void;
}

/**
 * One line of the cart.
 *
 * Pulled out of `CartPanel` and memoised so that editing one line's quantity
 * re-renders that line rather than all of them. On a low-end Android till a
 * full cart re-rendering on every keystroke is the input lag cashiers feel.
 *
 * The draft state of both inline editors lives here rather than in the panel,
 * which is the half that actually matters: while it sat in the panel, typing a
 * single character of a price override re-rendered every line in the cart plus
 * the whole payment section below it. Which line is open still belongs to the
 * panel -- only one may be at a time -- but that is a boolean per line, so
 * opening an editor re-renders the two lines whose state changed and no more.
 *
 * Every prop is a scalar or a callback for exactly this reason: pass `atMax`
 * as a boolean rather than the `atMax(line)` predicate, and the memo
 * comparison stays a value comparison.
 */
function CartLineRowInner({
  line: l,
  isLast,
  lastItemRef,
  atMax,
  serialWarning,
  menuOpen,
  onMenuOpenChange,
  editor,
  onEditorChange,
  onSetQty,
  onUpdateLine,
  storeId,
}: CartLineRowProps) {
  // Drafts, seeded when the editor opens so they always start from the line as
  // it stands rather than from whatever was typed last time.
  const [editUnitPrice, setEditUnitPrice] = useState('');
  const [editDiscount, setEditDiscount] = useState('');
  const [editDiscountType, setEditDiscountType] = useState<DiscountType>('amount');
  const [editSerials, setEditSerials] = useState<string[]>([]);

  const openPriceEditor = () => {
    setEditUnitPrice(l.unitPrice != null ? String(l.unitPrice) : '');
    setEditDiscount(l.discount ? String(l.discount) : '');
    setEditDiscountType('amount');
    onMenuOpenChange(false);
    onEditorChange('price');
  };

  const openSerialsEditor = () => {
    setEditSerials(l.serials ?? []);
    onMenuOpenChange(false);
    onEditorChange('serials');
  };

  return (
    <li
      ref={isLast ? lastItemRef : undefined}
      className="flex flex-col gap-2 px-3 py-2"
    >
      <div className="flex items-center gap-2">
        {l.product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={l.product.imageUrl}
            alt={l.product.name}
            decoding="async"
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
            <ExpiryBadge
              product={l.product}
              onHand={l.product.onHandQty != null ? Number(l.product.onHandQty) : undefined}
            />
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {l.product.sku || l.product.unit}
          </div>
          <div className="mt-1 flex items-center gap-1">
            <Tooltip content="Remove one">
              <Button
                size="icon"
                variant="outline"
                className="h-7 w-7"
                aria-label={`Decrease quantity of ${l.product.name}`}
                onClick={() => onSetQty(l.product.id, l.quantity - 1)}
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
            <QtyInput
              value={l.quantity}
              unit={l.product.unit}
              onCommit={(q) => onSetQty(l.product.id, q)}
            />
            <Tooltip content={atMax ? 'No more in stock' : 'Add one'}>
              <Button
                size="icon"
                variant="outline"
                className="h-7 w-7"
                aria-label={`Increase quantity of ${l.product.name}`}
                disabled={atMax}
                onClick={() => onSetQty(l.product.id, l.quantity + 1)}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {l.unitPrice != null || l.discount ? (
            <>
              <span className="whitespace-nowrap text-[11px] text-muted-foreground line-through">
                {formatMoney(Number(l.product.sellingPrice) * l.quantity)}
              </span>
              <span className="whitespace-nowrap text-sm font-semibold text-primary">
                {formatMoney(lineNet(l))}
              </span>
            </>
          ) : (
            <span className="whitespace-nowrap text-sm font-semibold text-foreground">
              {formatMoney(lineNet(l))}
            </span>
          )}
          <div className="relative">
            <Tooltip content="Price, discount and more">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
                aria-label={`More options for ${l.product.name}`}
                onClick={() => onMenuOpenChange(!menuOpen)}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </Tooltip>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => onMenuOpenChange(false)} />
                <div className="absolute right-0 top-8 z-30 w-44 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-md">
                  <button
                    onClick={openPriceEditor}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                  >
                    <Tag className="h-4 w-4" /> Price / discount
                  </button>
                  {l.product.trackSerials && (
                    <button
                      onClick={openSerialsEditor}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                    >
                      <Hash className="h-4 w-4" /> Serials
                    </button>
                  )}
                  <button
                    onClick={() => {
                      onMenuOpenChange(false);
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
      </div>

      {serialWarning && editor !== 'serials' && (
        <p className="flex items-center gap-1 text-xs text-warning">
          <AlertTriangle className="h-3.5 w-3.5" />
          {serialWarning}
        </p>
      )}

      {editor === 'serials' && (
        <div className="space-y-2 rounded-md border border-dashed border-border bg-muted/30 p-2.5">
          <Field label="Serial / IMEI of each unit sold — tick or scan them">
            {storeId ? (
              <SerialPicker
                storeId={storeId}
                productId={l.product.id}
                value={editSerials}
                onChange={setEditSerials}
              />
            ) : (
              <p className="text-xs text-muted-foreground">Open a shift to pick units.</p>
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => onEditorChange(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onUpdateLine(l.product.id, { serials: editSerials });
                // The units picked are the quantity sold.
                if (editSerials.length > 0 && editSerials.length !== l.quantity) {
                  onSetQty(l.product.id, editSerials.length);
                }
                onEditorChange(null);
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      )}

      {editor === 'price' && (
        <div className="space-y-2 rounded-md border border-dashed border-border bg-muted/30 p-2.5">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Unit price">
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder={String(Number(l.product.sellingPrice))}
                value={editUnitPrice}
                onChange={(e) => setEditUnitPrice(e.target.value)}
              />
            </Field>
            <Field label="Discount">
              <div className="flex gap-1">
                <Select
                  className="w-16 shrink-0"
                  value={editDiscountType}
                  onChange={(e) => setEditDiscountType(e.target.value as DiscountType)}
                >
                  <option value="amount">{currencySymbol()}</option>
                  <option value="percent">%</option>
                </Select>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={editDiscountType === 'percent' ? 100 : undefined}
                  value={editDiscount}
                  onChange={(e) => setEditDiscount(e.target.value)}
                />
              </div>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => onEditorChange(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const unitPrice = editUnitPrice.trim()
                  ? Math.max(0, Number(editUnitPrice))
                  : undefined;
                const basePrice = unitPrice ?? Number(l.product.sellingPrice);
                const rawDiscount = Math.max(0, Number(editDiscount) || 0);
                const discount =
                  editDiscountType === 'percent'
                    ? Math.round(
                        ((basePrice * l.quantity * Math.min(rawDiscount, 100)) / 100) * 100,
                      ) / 100
                    : Math.min(rawDiscount, basePrice * l.quantity);
                onUpdateLine(l.product.id, { unitPrice, discount: discount || undefined });
                onEditorChange(null);
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export const CartLineRow = memo(CartLineRowInner);

function QtyInput({
  value,
  unit,
  onCommit,
}: {
  value: number;
  unit?: string;
  onCommit: (q: number) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(String(value));
  // Measured goods (kg, l, m) sell in fractions; discrete ones don't, so don't
  // let the cashier type a decimal point the API is only going to reject.
  const fractional = allowsFraction(unit);
  return (
    <input
      type="text"
      inputMode={fractional ? 'decimal' : 'numeric'}
      aria-label={unit ? `Quantity in ${unit}` : 'Quantity'}
      className="h-7 w-14 rounded border border-input bg-background text-center text-base sm:text-sm"
      value={focused ? draft : String(value)}
      onFocus={(e) => {
        setDraft(String(value));
        setFocused(true);
        e.target.select();
      }}
      onChange={(e) => {
        // Digits with at most one decimal point, matching the backend's
        // numeric(12,3) quantity columns (weighed goods can be fractional).
        const next = e.target.value.replace(fractional ? /[^\d.]/g : /[^\d]/g, '');
        setDraft(next.replace(/(\..*)\./g, '$1'));
      }}
      onBlur={() => {
        setFocused(false);
        const raw = parseFloat(draft) || 0;
        const parsed = fractional ? Math.round(raw * 1000) / 1000 : Math.round(raw);
        onCommit(Math.max(0, parsed));
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
