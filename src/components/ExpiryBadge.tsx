import type { Product } from '@/types';
import { EXPIRY_TONE, productExpiry } from '@/lib/expiry';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * "Expired" / "3 expired" / "Expires in 12d" for a product, or nothing when
 * there's nothing to warn about. `onHand` is the shelf count where known: with
 * it, a batch-tracked product whose every unit has expired reads "Expired".
 */
export function ExpiryBadge({
  product,
  onHand,
  className,
}: {
  product: Product;
  onHand?: number;
  className?: string;
}) {
  const exp = productExpiry(product, onHand);
  if (!exp) return null;
  const title =
    exp.kind === 'soon'
      ? `Expires ${formatDate(exp.date)}`
      : exp.kind === 'partial'
        ? `${exp.expiredQty} ${product.unit} in expired batches`
        : exp.date
          ? `Expired ${formatDate(exp.date)}`
          : 'All stock here has expired';
  return (
    <span
      title={title}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        EXPIRY_TONE[exp.kind],
        className,
      )}
    >
      {exp.label}
    </span>
  );
}
