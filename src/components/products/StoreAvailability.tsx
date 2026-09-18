'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Store as StoreIcon } from 'lucide-react';
import { ProductsApi } from '@/api';
import { useStores } from '@/hooks/useStores';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';

/**
 * Which stores carry this product. Sits inside the product create/edit dialog,
 * beside VariantsSection.
 *
 * There is no availability table: a store carries a product exactly when it
 * has a StockItem row for it, so ticking a store seeds a zero-quantity row and
 * unticking one deletes it. The API refuses to untick a branch that still
 * holds stock, and moves the product's variants along with it.
 *
 * Renders nothing for a single-store business, and nothing for staff — only
 * owners and managers decide which branch stocks what.
 */
export function StoreAvailability({ productId }: { productId: string | null }) {
  const qc = useQueryClient();
  const { show } = useToast();
  const { user } = useAuth();
  const { data: stores } = useStores();
  const [draft, setDraft] = useState<Set<string> | null>(null);

  const isAdmin = user?.role === 'OWNER' || user?.role === 'MANAGER';

  const { data: product } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => ProductsApi.get(productId!),
    enabled: !!productId && isAdmin,
  });

  const save = useMutation({
    mutationFn: (storeIds: string[]) => ProductsApi.setStores(productId!, storeIds),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['product', productId] });
      void qc.invalidateQueries({ queryKey: ['stock'] });
      setDraft(null);
      show(
        res.variantsUpdated
          ? `Stores updated (${res.variantsUpdated} variant${res.variantsUpdated === 1 ? '' : 's'} moved too)`
          : 'Stores updated',
      );
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  // A product that does not exist yet is stocked at create time, and a
  // one-store business has nothing to choose between.
  if (!productId || !isAdmin) return null;
  const active = (stores ?? []).filter((s) => s.isActive);
  if (active.length < 2) return null;

  const carried = new Set((product?.stockItems ?? []).map((r) => r.storeId));
  const current = draft ?? carried;
  const dirty = draft !== null;

  const toggle = (id: string) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDraft(next);
  };

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <StoreIcon className="h-4 w-4" /> Stocked at
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        Only the branches ticked here list this product. Untick a branch to drop
        it — allowed once that branch&apos;s stock is zero.
      </p>
      <div className="flex flex-wrap gap-3">
        {active.map((s) => (
          <label key={s.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={current.has(s.id)}
              onChange={() => toggle(s.id)}
            />
            {s.name}
          </label>
        ))}
      </div>
      {dirty && (
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            size="sm"
            loading={save.isPending}
            onClick={() => save.mutate([...current])}
          >
            Save stores
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setDraft(null)}>
            Reset
          </Button>
        </div>
      )}
    </div>
  );
}
