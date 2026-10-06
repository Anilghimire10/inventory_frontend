'use client';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem<T extends string> {
  id: T;
  label: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  /** After the label: a count, a "needs attention" dot. */
  extra?: React.ReactNode;
}

/**
 * Switches between views of one page -- the one tab style in the app: an
 * underlined row. On a phone it scrolls sideways rather than wrapping onto
 * several lines. A real tab list for screen readers: the chosen tab is the
 * one Tab stop, and the arrow keys, Home and End move between tabs.
 *
 * Filters and toggles inside a section (a date range, sales/bills/units) are
 * a different control and keep their pill buttons.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** What the tabs choose between, for screen readers. */
  label: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  // On a phone the row scrolls sideways, and a page opened on a later tab
  // (a ?tab= link, a reload) showed the first few with the chosen one off to
  // the right -- no sign of where you were. Bring it into view.
  const activeIndex = items.findIndex((t) => t.id === value);
  useEffect(() => {
    const tab = refs.current[activeIndex];
    const row = tab?.parentElement;
    if (!tab || !row) return;
    const start = tab.offsetLeft;
    const end = start + tab.offsetWidth;
    if (start < row.scrollLeft) row.scrollLeft = start;
    else if (end > row.scrollLeft + row.clientWidth) row.scrollLeft = end - row.clientWidth;
  }, [activeIndex]);
  const move = (to: number) => {
    const i = (to + items.length) % items.length;
    refs.current[i]?.focus();
    onChange(items[i].id);
  };
  const keys: Record<string, (i: number) => number> = {
    ArrowRight: (i) => i + 1,
    ArrowLeft: (i) => i - 1,
    Home: () => 0,
    End: () => items.length - 1,
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      // The baseline is an inset shadow, not a border: a scrolling row clips a
      // tab's border pulled over its own, but paints over its own shadow.
      className={cn('relative flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_hsl(var(--border))]', className)}
    >
      {items.map((t, i) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              const to = keys[e.key];
              if (!to) return;
              e.preventDefault();
              move(to(i));
            }}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t-md border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
            )}
          >
            {t.icon && <t.icon className="h-4 w-4" />}
            {t.label}
            {t.extra}
          </button>
        );
      })}
    </div>
  );
}
