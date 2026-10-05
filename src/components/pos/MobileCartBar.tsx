'use client';
import { ChevronUp, ShoppingCart } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The floating bar that opens the cart sheet on phones: the cart's count and
 * total, or, with an empty cart, how many sales are on hold. Hidden on lg+,
 * where the cart is always on screen.
 */
export function MobileCartBar({
  cartCount,
  heldCount,
  total,
  onOpen,
}: {
  cartCount: number;
  heldCount: number;
  total: number;
  onOpen: () => void;
}) {
  if (cartCount === 0 && heldCount === 0) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'fixed inset-x-4 bottom-4 z-40 flex h-14 items-center gap-3 rounded-full border px-4 shadow-lg lg:hidden',
        cartCount > 0 ? 'border-border bg-card' : 'border-warning/40 bg-warning/10',
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full',
          cartCount > 0 ? 'bg-primary text-primary-foreground' : 'bg-warning/20 text-warning',
        )}
      >
        <ShoppingCart className="h-4 w-4" />
      </span>
      {cartCount > 0 ? (
        <>
          <span className="text-sm font-semibold text-foreground">
            {cartCount} item{cartCount !== 1 ? 's' : ''}
          </span>
          <span className="ml-auto text-base font-bold text-primary">{formatMoney(total)}</span>
        </>
      ) : (
        <span className="text-sm font-semibold text-foreground">
          {heldCount} sale{heldCount !== 1 ? 's' : ''} on hold
        </span>
      )}
      <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground" />
    </button>
  );
}
