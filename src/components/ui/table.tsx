import { cn } from '@/lib/utils';

export function Table({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-x-auto rounded-lg border border-border bg-card">
      <table className={cn('w-full text-sm', className)} {...props} />
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
      {children}
    </thead>
  );
}

export function TH({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('px-3 py-3 font-medium sm:px-4', className)} {...props} />;
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

/** Controls inside a row that do their own thing rather than open it. */
const INTERACTIVE = 'button, a, input, select, textarea, label, [role="button"]';

export function TR({
  className,
  onOpen,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & {
  /**
   * Makes the whole row open its record (a details dialog). Clicks on a
   * checkbox or button inside the row still do only that, and the row is
   * reachable by keyboard: Tab to it, Enter to open.
   */
  onOpen?: () => void;
}) {
  const open = onOpen && {
    tabIndex: 0,
    onClick: (e: React.MouseEvent<HTMLTableRowElement>) => {
      if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
      onOpen();
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLTableRowElement>) => {
      if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      onOpen();
    },
  };
  return (
    <tr
      className={cn(
        'hover:bg-muted/40 transition-colors',
        onOpen && 'cursor-pointer focus-visible:bg-muted/40 focus-visible:outline-none',
        className,
      )}
      {...open}
      {...props}
    />
  );
}

export function TD({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-3 align-middle sm:px-4', className)} {...props} />;
}
