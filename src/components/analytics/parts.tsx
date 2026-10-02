'use client';
import { Card } from '@/components/ui/card';
import { Hint } from '@/components/ui/tooltip';

/**
 * A section's title, a plain sentence on what it shows and what to do about
 * it, and optional controls on the right.
 */
export function SectionHeader({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-border p-5">
      <div className="min-w-0 flex-1 basis-64">
        <h2 className="flex items-center gap-2 font-semibold">
          {Icon && <Icon className="h-5 w-5 text-primary" />}
          {title}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

export function KpiCard({
  icon: Icon, label, hint, value, sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  /** What the figure means, in plain words: shown on hover of the label. */
  hint: string;
  value: string;
  /** A line of context under the figure. */
  sub?: string;
}) {
  return (
    <Card className="p-5">
      {/* Icon on the title row, so a long amount has the card's full width. */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground"><Hint tip={hint}>{label}</Hint></p>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-primary xl:text-xl 2xl:text-2xl">
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}
