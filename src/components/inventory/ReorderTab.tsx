'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, PackagePlus } from 'lucide-react';
import { PurchasesApi } from '@/api';
import type { ReorderSuggestionGroup, Store } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';

/** Which suggestions a pending "create drafts" confirmation covers. */
type DraftTarget = { storeId?: string; supplierId?: string; label: string };

/**
 * Stock → Reorder: what is at or below its reorder level, grouped into the
 * orders it would make (one per store and supplier), and raised as draft
 * purchase orders on confirmation.
 */
export function ReorderTab({
  stores,
  onOpenProduct,
}: {
  stores: Store[] | undefined;
  /** A row click: that product's details at that row's store. */
  onOpenProduct?: (productId: string, storeId?: string) => void;
}) {
  const qc = useQueryClient();
  const { show } = useToast();
  const [reorderStoreId, setReorderStoreId] = useState('');
  const [draftTarget, setDraftTarget] = useState<DraftTarget | null>(null);

  // Unlike the count sheet, this spans every store unless one is picked --
  // the server groups by store anyway, so "All stores" is a useful default.
  const reorder = useQuery({
    queryKey: ['reorder-suggestions', reorderStoreId],
    queryFn: () => PurchasesApi.reorderSuggestions(reorderStoreId || undefined),
  });

  const createDrafts = useMutation({
    mutationFn: (t: DraftTarget) =>
      PurchasesApi.reorderDrafts({ storeId: t.storeId, supplierId: t.supplierId }),
    onSuccess: (drafts) => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['reorder-suggestions'] });
      show(
        `${drafts.length} draft order${drafts.length !== 1 ? 's' : ''} created — ` +
          'review them on Purchases.',
      );
      setDraftTarget(null);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const suggestedItemCount = (reorder.data ?? []).reduce(
    (n, g) => n + g.items.length,
    0,
  );

  return (
    <>
    <div className="space-y-4">
      {stores && stores.length > 1 && (
        <Field label="Store">
          <Select
            value={reorderStoreId}
            onChange={(e) => setReorderStoreId(e.target.value)}
            className="max-w-xs"
          >
            <option value="">All stores</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      )}

      {reorder.isError ? <ErrorState onRetry={() => reorder.refetch()} /> :
        reorder.isLoading ? <LoadingBlock /> :
        !reorder.data || reorder.data.length === 0 ? (
          <EmptyState
            title="Nothing to reorder"
            description="No items are at or below their reorder level."
            icon={PackagePlus}
          />
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {suggestedItemCount} item{suggestedItemCount !== 1 ? 's' : ''} below
                reorder level, grouped into {reorder.data.length} order
                {reorder.data.length !== 1 ? 's' : ''}. Suggested quantities restock
                each item to twice its reorder level, priced at the last cost paid.
              </p>
              <Button
                className="shrink-0"
                onClick={() =>
                  setDraftTarget({
                    storeId: reorderStoreId || undefined,
                    label: `all ${reorder.data!.length} suggested order${reorder.data!.length !== 1 ? 's' : ''}`,
                  })
                }
              >
                <PackagePlus className="h-4 w-4" /> Create all drafts
              </Button>
            </div>

            {reorder.data.map((g) => (
              <ReorderGroupCard
                key={`${g.storeId}|${g.supplierId ?? ''}`}
                group={g}
                multiStore={!!stores && stores.length > 1}
                onDraft={setDraftTarget}
                onOpenProduct={onOpenProduct}
              />
            ))}
          </>
        )}
    </div>

    <Dialog
      open={!!draftTarget}
      onClose={() => setDraftTarget(null)}
      title="Create draft purchase orders"
      description={`This raises ${draftTarget?.label ?? ''} on the Purchases page.`}
    >
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
        <li>
          The orders are saved as <strong className="text-foreground">drafts</strong> —
          nothing is received and nothing is paid. Stock only moves when the goods
          arrive and you receive the order.
        </li>
        <li>
          Quantities are recalculated on the server as you confirm, so they can differ
          from the table above if stock moved in the meantime.
        </li>
        <li>
          Confirming again later creates a{' '}
          <strong className="text-foreground">second set</strong> of drafts — the
          suggestions do not disappear once ordered.
        </li>
      </ul>
      <DialogFooter>
        <Button variant="outline" onClick={() => setDraftTarget(null)}>Cancel</Button>
        <Button
          loading={createDrafts.isPending}
          onClick={() => draftTarget && createDrafts.mutate(draftTarget)}
        >
          Create drafts
        </Button>
      </DialogFooter>
    </Dialog>
    </>
  );
}

/**
 * One suggested order: every low-stock item for a single store + supplier.
 * Groups with no supplier cannot be drafted on their own -- the server reads a
 * missing supplierId as "no filter" and would draft every group -- so they are
 * raised through "Create all drafts" instead.
 */
function ReorderGroupCard({
  group,
  multiStore,
  onDraft,
  onOpenProduct,
}: {
  group: ReorderSuggestionGroup;
  multiStore: boolean;
  onDraft: (t: DraftTarget) => void;
  onOpenProduct?: (productId: string, storeId?: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-medium">
            {group.supplierName ?? 'No supplier on record'}
          </p>
          <p className="text-xs text-muted-foreground">
            {multiStore && <>{group.storeName} · </>}
            {group.items.length} item{group.items.length !== 1 ? 's' : ''} ·{' '}
            {formatMoney(group.total)}
          </p>
        </div>
        {group.supplierId ? (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() =>
              onDraft({
                storeId: group.storeId,
                supplierId: group.supplierId!,
                label: `the ${group.items.length}-item order for ${group.supplierName}`,
              })
            }
          >
            Create draft order
          </Button>
        ) : (
          <p className="max-w-xs text-xs text-muted-foreground sm:text-right">
            Never purchased, so there is no supplier to order from. Included in
            &ldquo;Create all drafts&rdquo;.
          </p>
        )}
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Product</TH>
            <TH>SKU</TH>
            <TH className="text-right">On hand</TH>
            <TH className="text-right">Reorder at</TH>
            <TH className="text-right">Order</TH>
            <TH className="text-right">Unit cost</TH>
            <TH className="text-right">Line total</TH>
          </TR>
        </THead>
        <TBody>
          {group.items.map((it) => (
            <TR key={it.productId} onOpen={onOpenProduct && (() => onOpenProduct(it.productId, group.storeId))}>
              <TD className="font-medium">{it.name}</TD>
              <TD className="text-muted-foreground">{it.sku || '—'}</TD>
              <TD className="text-right text-destructive">
                <span className="inline-flex items-center justify-end gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  {it.onHand}
                </span>
              </TD>
              <TD className="text-right text-muted-foreground">{it.reorderLevel}</TD>
              <TD className="text-right font-medium">
                {it.quantity} <span className="text-muted-foreground">{it.unit}</span>
              </TD>
              <TD className="text-right text-muted-foreground">
                {formatMoney(it.costPrice)}
                {!it.lastPurchasedAt && (
                  <Badge tone="muted" className="ml-2">est.</Badge>
                )}
              </TD>
              <TD className="text-right font-medium">
                {formatMoney(it.quantity * it.costPrice)}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
