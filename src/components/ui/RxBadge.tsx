import { Pill } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Small pill badge marking a product as prescription-only.
 * `filled` renders on a solid (blurred) card background for overlaying
 * product images; the default translucent style suits inline labels.
 */
export function RxBadge({
  filled,
  className,
}: {
  filled?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide',
        filled
          ? 'border border-border bg-card/90 text-destructive backdrop-blur-sm'
          : 'bg-destructive/10 text-destructive',
        className,
      )}
    >
      <Pill className="h-3 w-3" />
      Rx
    </span>
  );
}