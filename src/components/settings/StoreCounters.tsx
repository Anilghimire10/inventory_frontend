'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Plus, Power, RotateCcw, Wallet, X } from 'lucide-react';
import { CountersApi } from '@/api';
import type { Counter } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';

/**
 * A store's counters -- its cash drawers -- set up before staff are assigned:
 * a cashier is assigned to one in Staff and only ever opens that one, and an
 * owner or manager chooses one at the till.
 *
 * Counters are taken out of use rather than deleted, so old shifts keep the
 * name of the drawer they counted. The API refuses that while a shift is open
 * on it, a cashier is still assigned to it, or it is the store's last one,
 * and says which.
 *
 * `counters` is this store's share of one list Settings loads for every
 * store -- one request, rather than one per store.
 */
export function StoreCounters({
  storeId,
  storeName,
  counters,
  isError,
}: {
  storeId: string;
  storeName: string;
  counters: Counter[] | undefined;
  isError: boolean;
}) {
  const qc = useQueryClient();
  const { show } = useToast();
  const [adding, setAdding] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  // Staff, the till and the open-shift dialog all read counters.
  const refresh = () => qc.invalidateQueries({ queryKey: ['counters'] });

  const add = useMutation({
    mutationFn: (name: string) => CountersApi.create({ storeId, name }),
    onSuccess: (c) => {
      refresh();
      setAdding('');
      show(`${c.name} added to ${storeName}`);
    },
    onError: (e) => show(apiError(e), 'error'),
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; isActive?: boolean }) => CountersApi.update(id, body),
    onSuccess: (_c, v) => {
      refresh();
      setEditing(null);
      show(v.isActive === false ? 'Counter taken out of use' : v.isActive ? 'Counter back in use' : 'Counter renamed');
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const status = (c: Counter) =>
    c.openShift
      ? `Open · ${c.openShift.user.name}’s shift`
      : c.staff.length
        ? `Cashier${c.staff.length === 1 ? '' : 's'}: ${c.staff.map((u) => u.name).join(', ')}`
        : 'No cashier assigned';

  if (isError) return <p className="mt-2 text-xs text-destructive">Couldn’t load the counters.</p>;

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Wallet className="h-3.5 w-3.5" /> Counters (tills)
      </div>
      <ul className="space-y-1.5">
        {(counters ?? []).map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
            {editing?.id === c.id ? (
              <form
                className="flex flex-1 items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (editing.name.trim()) update.mutate({ id: c.id, name: editing.name.trim() });
                }}
              >
                <Input
                  autoFocus
                  aria-label={`New name for ${c.name}`}
                  className="h-8 max-w-48"
                  maxLength={60}
                  value={editing.name}
                  onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                />
                <Tooltip content="Save">
                  <Button type="submit" size="icon" variant="ghost" loading={update.isPending} aria-label="Save name">
                    <Check className="h-4 w-4" />
                  </Button>
                </Tooltip>
                <Tooltip content="Cancel">
                  <Button type="button" size="icon" variant="ghost" onClick={() => setEditing(null)} aria-label="Cancel">
                    <X className="h-4 w-4" />
                  </Button>
                </Tooltip>
              </form>
            ) : (
              <>
                <span className="font-medium">{c.name}</span>
                {!c.isActive && <Badge tone="muted">Not in use</Badge>}
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{c.isActive ? status(c) : ''}</span>
                <Tooltip content="Rename">
                  <Button size="icon" variant="ghost" onClick={() => setEditing({ id: c.id, name: c.name })} aria-label={`Rename ${c.name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </Tooltip>
                {c.isActive ? (
                  <Tooltip content="Take out of use">
                    <Button
                      size="icon"
                      variant="ghost"
                      loading={update.isPending && update.variables?.id === c.id && update.variables.isActive === false}
                      onClick={() => update.mutate({ id: c.id, isActive: false })}
                      aria-label={`Take ${c.name} out of use`}
                    >
                      <Power className="h-4 w-4 text-destructive" />
                    </Button>
                  </Tooltip>
                ) : (
                  <Tooltip content="Put back in use">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => update.mutate({ id: c.id, isActive: true })}
                      aria-label={`Put ${c.name} back in use`}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (adding.trim()) add.mutate(adding.trim());
        }}
      >
        <Input
          aria-label={`New counter at ${storeName}`}
          className="h-8 max-w-48"
          placeholder={`Counter ${(counters?.length ?? 0) + 1}`}
          maxLength={60}
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
        />
        <Button type="submit" size="sm" variant="outline" loading={add.isPending} disabled={!adding.trim()}>
          <Plus className="h-4 w-4" /> Add counter
        </Button>
      </form>
    </div>
  );
}
