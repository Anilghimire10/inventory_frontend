'use client';
import { useId, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import type { Paginated } from '@/types';
import { useDebounced } from '@/hooks/useDebounced';
import { cn } from '@/lib/utils';

/** How many matches the list shows; past that, the user keeps typing. */
const PICK_LIMIT = 20;

interface SearchPickerProps<T extends { id: string }> {
  /**
   * Cache key prefix for the searches. The search text and limit are appended,
   * so a prefix like `['products', 'pick']` is refreshed by the same
   * `invalidateQueries(['products'])` that already follows product edits.
   */
  queryKey: readonly unknown[];
  /** One page of matches for `search` (empty string: the first page). */
  fetchPage: (search: string, limit: number) => Promise<Paginated<T>>;
  label: (item: T) => string;
  /** Secondary text on the right of a row, e.g. a SKU or phone number. */
  detail?: (item: T) => string | null | undefined;
  onPick: (item: T | null) => void;
  /**
   * The current choice, for a picker that holds a value (a filter, a
   * supplier). Leave it out for one that adds lines: the box clears after
   * each pick.
   */
  selected?: { id: string; label: string } | null;
  /** Offer a "none" row with this label, e.g. "All products". */
  noneLabel?: string;
  /** Items already used, shown but not pickable (a line already on the order). */
  isTaken?: (item: T) => boolean;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}

/**
 * Type-to-search picker backed by the server.
 *
 * Replaces native `<select>`s that were filled from one `limit: 100` page,
 * sorted by name: in a shop with more than a hundred products (or suppliers)
 * everything past the first hundred alphabetically could not be chosen at all,
 * and a hundred-row select is unusable on a phone anyway.
 */
export function SearchPicker<T extends { id: string }>({
  queryKey,
  fetchPage,
  label,
  detail,
  onPick,
  selected,
  noneLabel,
  isTaken,
  placeholder = 'Search…',
  className,
  'aria-label': ariaLabel,
}: SearchPickerProps<T>) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const typed = query.trim();
  const search = useDebounced(typed);
  const results = useQuery({
    queryKey: [...queryKey, search, PICK_LIMIT],
    queryFn: () => fetchPage(search, PICK_LIMIT),
    enabled: open,
    placeholderData: keepPreviousData,
  });
  const items = results.data?.data ?? [];
  const moreThanShown = (results.data?.meta.total ?? 0) > items.length;
  // Enter acts on the list that answers what is in the box now, never on the
  // one from a keystroke ago.
  const settled = search === typed && !results.isFetching;

  // Row 0 is the "none" row when there is one.
  const rows: (T | null)[] = noneLabel ? [null, ...items] : items;
  const activeIndex = Math.min(active, Math.max(rows.length - 1, 0));

  const close = () => {
    setOpen(false);
    setQuery('');
    setActive(0);
  };
  const pick = (item: T | null) => {
    if (item && isTaken?.(item)) return;
    onPick(item);
    close();
  };

  return (
    <div className={className}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={ariaLabel ?? placeholder}
          aria-activedescendant={open && rows.length ? `${listId}-${activeIndex}` : undefined}
          // Closed, the box shows the current choice; open, what is being typed.
          value={open ? query : (selected?.label ?? '')}
          placeholder={open ? placeholder : (selected ? selected.label : (noneLabel ?? placeholder))}
          onFocus={() => setOpen(true)}
          // A pick leaves focus in the box, so clicking it again fires no
          // focus event; the click has to reopen the list itself.
          onClick={() => setOpen(true)}
          onBlur={close}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive(Math.min(activeIndex + 1, rows.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive(Math.max(activeIndex - 1, 0));
            } else if (e.key === 'Enter') {
              // Never submit the surrounding form from the search box.
              e.preventDefault();
              if (open && settled && rows.length) pick(rows[activeIndex]);
            } else if (e.key === 'Escape' && open) {
              // Close the list, not the dialog around it (see useFocusTrap).
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background py-0 pl-9 text-sm',
            'placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring outline-offset-0',
            selected && !open ? 'pr-9' : 'pr-3',
          )}
        />
        {selected && !open && noneLabel && (
          <button
            type="button"
            onClick={() => onPick(null)}
            aria-label={`Clear: ${noneLabel}`}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          // mousedown would blur the input (and close the list) before the
          // click that picks a row lands.
          onMouseDown={(e) => e.preventDefault()}
          // In the flow, not floating: these pickers live in dialogs whose
          // body scrolls, and a floating list overhung that body's edge and
          // was cut off -- on a phone, after about four rows. In the flow it
          // pushes the form down and the dialog scrolls to it as usual.
          className="mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-sm"
        >
          {rows.map((item, i) => {
            const taken = !!item && !!isTaken?.(item);
            return (
              <li
                key={item?.id ?? '__none__'}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                aria-disabled={taken || undefined}
                onClick={() => pick(item)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm',
                  i === activeIndex && 'bg-muted',
                  taken && 'cursor-default opacity-50',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{item ? label(item) : noneLabel}</span>
                {taken ? (
                  <span className="text-xs text-muted-foreground">Added</span>
                ) : (
                  item && detail?.(item) && (
                    <span className="shrink-0 text-xs text-muted-foreground">{detail(item)}</span>
                  )
                )}
              </li>
            );
          })}
          {results.isPending && (
            <li className="px-3 py-2 text-xs text-muted-foreground">Searching…</li>
          )}
          {results.isError && (
            <li className="px-3 py-2 text-xs text-destructive">
              Couldn&apos;t search. Check the connection and try again.
            </li>
          )}
          {settled && !results.isError && items.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              {typed ? `No matches for “${typed}”.` : 'Nothing here yet.'}
            </li>
          )}
          {moreThanShown && (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              Showing the first {items.length}. Keep typing to narrow it down.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
