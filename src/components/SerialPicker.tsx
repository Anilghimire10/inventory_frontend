'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { InventoryApi } from '@/api';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

/**
 * Choose serialised units by serial / IMEI.
 *
 * - `pick`: tick units on file at the store (selling, removing, moving,
 *   counting). With `allowExtra`, units not on file can be scanned in too --
 *   a stock take finding one that was never booked.
 * - `enter`: scan or type new units (stock added by hand).
 *
 * The scan box takes one serial per Enter, which is how a barcode scanner
 * types. `max` caps how many can be chosen.
 */
export function SerialPicker({
  storeId,
  productId,
  value,
  onChange,
  mode = 'pick',
  allowExtra = false,
  max,
}: {
  storeId: string;
  productId: string;
  value: string[];
  onChange: (serials: string[]) => void;
  mode?: 'pick' | 'enter';
  allowExtra?: boolean;
  max?: number;
}) {
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const onFile = useQuery({
    queryKey: ['serials', 'in-stock', storeId, productId],
    queryFn: () => InventoryApi.inStockSerials(storeId, productId),
    enabled: mode === 'pick' && !!storeId && !!productId,
  });
  const listed = onFile.data ?? [];
  const extras = value.filter((v) => !listed.includes(v));
  const full = max != null && value.length >= max;

  const toggle = (serial: string, on: boolean) =>
    onChange(on ? [...value, serial] : value.filter((v) => v !== serial));

  const addTyped = () => {
    const serial = draft.trim();
    if (!serial) return;
    setDraft('');
    if (value.includes(serial)) return setProblem(`${serial} is already chosen`);
    if (full) return setProblem(`Only ${max} can be chosen`);
    if (mode === 'pick' && !allowExtra && !listed.includes(serial)) {
      return setProblem(`${serial} isn’t in stock here`);
    }
    setProblem(null);
    onChange([...value, serial]);
  };

  return (
    <div className="space-y-2">
      {mode === 'pick' &&
        (onFile.isLoading ? (
          <Spinner className="py-3" />
        ) : onFile.isError ? (
          // Not "no units on file": a dropped connection would read as empty stock.
          <p className="text-xs text-destructive">
            Couldn&rsquo;t load the serial numbers on file.{' '}
            <button type="button" className="font-medium underline" onClick={() => onFile.refetch()}>
              Retry
            </button>{' '}
            or type them in below.
          </p>
        ) : listed.length === 0 ? (
          <p className="text-xs text-muted-foreground">No units of this product are on file here.</p>
        ) : (
          <div className="max-h-48 overflow-y-auto rounded-md border border-border p-2">
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {listed.map((serial) => {
                const on = value.includes(serial);
                return (
                  <label
                    key={serial}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 font-mono text-xs hover:bg-muted',
                      !on && full && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={on}
                      disabled={!on && full}
                      onChange={(e) => toggle(serial, e.target.checked)}
                    />
                    {serial}
                  </label>
                );
              })}
            </div>
          </div>
        ))}

      {(
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTyped();
            }
          }}
          onBlur={addTyped}
          className="font-mono"
          placeholder={
            mode === 'enter'
              ? 'Scan or type a serial, then Enter'
              : allowExtra
                ? 'Scan a unit to tick it, or one not listed to add it'
                : 'Scan a unit to tick it'
          }
          aria-label="Scan or type a serial number"
        />
      )}
      {problem && <p className="text-xs text-destructive">{problem}</p>}

      {(mode === 'enter' ? value : extras).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {(mode === 'enter' ? value : extras).map((serial) => (
            <span key={serial} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              {serial}
              <button
                type="button"
                onClick={() => toggle(serial, false)}
                aria-label={`Remove ${serial}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {value.length}
        {max != null ? ` of ${max}` : ''} chosen
      </p>
    </div>
  );
}
