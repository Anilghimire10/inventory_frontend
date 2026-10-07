'use client';
import { Package, Plus, Star } from 'lucide-react';
import type { Category, Product } from '@/types';
import { RxBadge } from '@/components/ui/RxBadge';
import { ErrorState, LoadingBlock } from '@/components/ui/misc';
import { Tooltip } from '@/components/ui/tooltip';
import { ExpiryBadge } from '@/components/ExpiryBadge';
import { clearanceFrom } from '@/lib/clearance';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Sentinel `categoryId` value for the pinned-favorites chip. */
export const FAVORITES = '__favorites__';

/**
 * The till's product picker: category chips, then a card per product with
 * its price, this store's stock and a favourite star. Tapping a card adds a
 * unit; an out-of-stock card can't be tapped.
 */
export function ProductGrid({
  categories,
  categoryId,
  onCategory,
  products,
  loading,
  error,
  onRetry,
  stockLoaded,
  onHand,
  reorderLevels,
  favorites,
  onToggleFavorite,
  onAdd,
}: {
  categories: Category[] | undefined;
  /** A category id, '' for all, or FAVORITES. */
  categoryId: string;
  onCategory: (id: string) => void;
  products: Product[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** False until the first page lands: unknown stock isn't shown as zero. */
  stockLoaded: boolean;
  onHand: Map<string, number>;
  reorderLevels: Map<string, number>;
  favorites: string[];
  onToggleFavorite: (productId: string) => void;
  onAdd: (product: Product) => void;
}) {
  return (
    <>
      {/* Category filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip active={categoryId === ''} onClick={() => onCategory('')}>
          All
        </Chip>
        <Chip active={categoryId === FAVORITES} onClick={() => onCategory(FAVORITES)}>
          <Star className={cn('h-3.5 w-3.5', categoryId === FAVORITES && 'fill-current')} />
          Favorites ({favorites.length})
        </Chip>
        {categories?.map((c) => (
          <Chip key={c.id} active={categoryId === c.id} onClick={() => onCategory(c.id)}>
            {c.name}
          </Chip>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {error ? (
          <ErrorState
            title="Couldn't load products"
            description="The product catalog failed to load -- this is not the same as being out of stock. Try again."
            onRetry={() => onRetry()}
          />
        ) : loading ? (
          <LoadingBlock label="Loading products…" />
        ) : (
          <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((p) => {
            const available = onHand.get(p.id) ?? 0;
            // Until the stock feed lands, "not loaded" is indistinguishable
            // from "zero" -- don't claim out of stock on a guess. Matches
            // maxOf, which treats an unknown product as unrestricted.
            const out = stockLoaded && available <= 0;
            const isFavorite = favorites.includes(p.id);
            return (
              <div
                key={p.id}
                role="button"
                tabIndex={out ? -1 : 0}
                onClick={out ? undefined : () => onAdd(p)}
                onKeyDown={out ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAdd(p); } }}
                className={cn(
                  'group flex cursor-pointer flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-all focus-visible:outline-2 focus-visible:outline-ring outline-offset-1',
                  out ? 'cursor-default opacity-50' : 'hover:border-primary/50 hover:shadow-md',
                )}
              >
                <div className="relative aspect-square w-full overflow-hidden bg-muted">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      loading="lazy"
                      decoding="async"
                      className={cn(
                        'h-full w-full object-cover transition-transform duration-300',
                        !out && 'group-hover:scale-105',
                      )}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <Package className="h-5 w-5" />
                    </div>
                  )}
                  <ExpiryBadge
                    product={p}
                    onHand={stockLoaded ? available : undefined}
                    className="absolute left-1.5 top-1.5 z-10 shadow-sm"
                  />
                  {out && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                      <span className="rounded-full bg-background px-2 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                        Out of stock
                      </span>
                    </div>
                  )}
                  <Tooltip
                    content={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    className="absolute right-1.5 top-1.5"
                  >
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite(p.id); }}
                    aria-label={isFavorite ? `Remove ${p.name} from favorites` : `Add ${p.name} to favorites`}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full bg-background/80 shadow-sm backdrop-blur-sm transition-colors sm:h-6 sm:w-6',
                      isFavorite ? 'text-warning' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Star className={cn('h-3.5 w-3.5', isFavorite && 'fill-current')} />
                  </button>
                  </Tooltip>
                </div>
                <div className="flex flex-1 flex-col gap-1 p-2.5">
                  <div className="flex items-start gap-1">
                    <span className="line-clamp-2 flex-1 text-sm font-medium">{p.name}</span>
                    {p.isRxRequired && <RxBadge />}
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-1">
                    {clearanceFrom(p.clearance) !== null ? (
                      // Marked down to sell before it expires; the till
                      // charges it on the units drawn from that stock.
                      <span className="flex flex-col leading-tight">
                        <span className="text-[11px] text-muted-foreground line-through">{formatMoney(p.sellingPrice)}</span>
                        <span className="text-sm font-bold text-success">
                          {formatMoney(clearanceFrom(p.clearance)!)}
                          <span className="ml-1 text-[10px] font-medium uppercase">Clearance</span>
                        </span>
                      </span>
                    ) : (
                      <span className="text-sm font-bold text-primary">{formatMoney(p.sellingPrice)}</span>
                    )}
                    <Tooltip content={out ? 'Out of stock' : 'Add to cart'}>
                    <button
                      disabled={out}
                      onClick={(e) => { e.stopPropagation(); onAdd(p); }}
                      aria-label={`Add ${p.name}`}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-40 sm:h-7 sm:w-7"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    </Tooltip>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs text-muted-foreground">{p.sku || p.unit}</span>
                    {stockLoaded && (
                      <StockBadge count={available} reorder={reorderLevels.get(p.id) ?? 0} />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {products.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {categoryId === FAVORITES
              ? 'No favorites yet — tap the star on a product to pin it here.'
              : 'No products found.'}
          </p>
        )}
          </>
        )}
      </div>
    </>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

/** Availability hint for product cards. */
function StockBadge({ count, reorder }: { count: number; reorder: number }) {
  if (count <= 0) {
    return (
      <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
        Out of stock
      </span>
    );
  }
  if (count <= reorder) {
    return (
      <span className="shrink-0 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
        Low: {count}
      </span>
    );
  }
  return <span className="shrink-0 text-xs text-muted-foreground">{count} in stock</span>;
}

