'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';
import { InventoryApi } from '@/api';
import type { CountSheetLine, Store, StockTakeResult } from '@/types';
import { SerialPicker } from '@/components/SerialPicker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { Hint } from '@/components/ui/tooltip';
import { apiError } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * Stock → Stock take: count a store's shelves against the system, review the
 * differences, and post them as adjustments. Serialised products are counted
 * by ticking their units.
 */
export function StockTakeTab({ stores }: { stores: Store[] | undefined }) {
  const qc = useQueryClient();
  const { show } = useToast();
  const [countStoreIdOverride, setCountStoreIdOverride] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  // Serialised products are counted by ticking units: the units found, by product.
  const [serialCounts, setSerialCounts] = useState<Record<string, string[]>>({});
  const [countingSerials, setCountingSerials] = useState<CountSheetLine | null>(null);
  const [seededSheet, setSeededSheet] = useState<CountSheetLine[] | undefined>(undefined);
  const [countNote, setCountNote] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [review, setReview] = useState<StockTakeResult | null>(null);

  // Falls back to the first store until the user picks one explicitly.
  const countStoreId = countStoreIdOverride || stores?.[0]?.id || '';

  const countSheet = useQuery({
    queryKey: ['count-sheet', countStoreId],
    queryFn: () => InventoryApi.countSheet(countStoreId),
    enabled: !!countStoreId,
    // Never refreshed behind the counter's back: a new sheet re-seeds the
    // counts below and would wipe what has been typed.
    refetchOnWindowFocus: false,
  });

  // Re-seed the editable counts to the system quantity whenever a fresh sheet loads
  // (new store, or after a post refetches it) -- untouched lines then post as zero variance.
  if (countSheet.data && countSheet.data !== seededSheet) {
    setSeededSheet(countSheet.data);
    setCounts(Object.fromEntries(countSheet.data.map((l) => [l.productId, l.system])));
    setSerialCounts({});
  }

  const buildCounts = () =>
    (countSheet.data ?? []).map((l) => ({
      productId: l.productId,
      counted: counts[l.productId] ?? l.system,
      ...(serialCounts[l.productId] ? { serials: serialCounts[l.productId] } : {}),
    }));

  const previewTake = useMutation({
    mutationFn: () =>
      InventoryApi.stockTake({
        storeId: countStoreId,
        preview: true,
        note: countNote || undefined,
        counts: buildCounts(),
      }),
    onSuccess: (data) => {
      setReview(data);
      setReviewOpen(true);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const postTake = useMutation({
    mutationFn: () =>
      InventoryApi.stockTake({
        storeId: countStoreId,
        note: countNote || undefined,
        counts: buildCounts(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['low-stock'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      qc.invalidateQueries({ queryKey: ['count-sheet'] });
      qc.invalidateQueries({ queryKey: ['serials'] });
      show('Stock take posted');
      setReviewOpen(false);
      setCountNote('');
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const changedCount = (countSheet.data ?? []).filter(
    (l) => (counts[l.productId] ?? l.system) !== l.system,
  ).length;

  return (
    <>
    <div className="space-y-4">
      {stores && stores.length > 1 && (
        <Field label="Store">
          <Select value={countStoreId} onChange={(e) => setCountStoreIdOverride(e.target.value)} className="max-w-xs">
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      )}

      {countSheet.isError ? <ErrorState onRetry={() => countSheet.refetch()} /> :
        countSheet.isLoading ? <LoadingBlock /> :
        !countSheet.data || countSheet.data.length === 0 ? (
          <EmptyState title="No products to count" description="Add active products before running a stock take." icon={ClipboardCheck} />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH>SKU</TH>
                  <TH className="text-right">System</TH>
                  <TH className="text-right">Counted</TH>
                  <TH className="text-right"><Hint tip="Counted minus the system quantity. Negative means stock is missing.">Variance</Hint></TH>
                </TR>
              </THead>
              <TBody>
                {countSheet.data.map((l) => {
                  const counted = counts[l.productId] ?? l.system;
                  const variance = counted - l.system;
                  return (
                    <TR key={l.productId}>
                      <TD className="font-medium">{l.name}</TD>
                      <TD className="text-muted-foreground">{l.sku || '—'}</TD>
                      <TD className="text-right text-muted-foreground">{l.system}</TD>
                      <TD className="text-right">
                        {l.trackSerials ? (
                          // Serialised: counted by ticking units, so the serial list follows.
                          <Button size="sm" variant="outline" className="ml-auto h-8"
                            onClick={() => setCountingSerials(l)}>
                            {serialCounts[l.productId] ? `${counted} ticked` : 'Tick units'}
                          </Button>
                        ) : (
                          <Input type="number" step="0.001" min="0" className="ml-auto h-8 w-24 text-right"
                            aria-label={`Counted ${l.name}`}
                            value={counted}
                            onChange={(e) =>
                              setCounts((c) => ({ ...c, [l.productId]: Number(e.target.value) || 0 }))
                            } />
                        )}
                      </TD>
                      <TD className={cn(
                        'text-right font-medium',
                        variance > 0 && 'text-success',
                        variance < 0 && 'text-destructive',
                      )}>
                        {variance > 0 ? '+' : ''}{variance || 0}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>

            <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end sm:justify-between">
              <Field label="Note (optional)" className="max-w-sm">
                <Input value={countNote} onChange={(e) => setCountNote(e.target.value)} />
              </Field>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {changedCount} of {countSheet.data.length} item{countSheet.data.length !== 1 ? 's' : ''} differ
                </span>
                <Button onClick={() => previewTake.mutate()} loading={previewTake.isPending}
                  disabled={changedCount === 0}>
                  Review stock take
                </Button>
              </div>
            </div>
          </>
        )}
    </div>

    <Dialog open={!!countingSerials} onClose={() => setCountingSerials(null)} title="Count by serial number"
      description={countingSerials ? `${countingSerials.name}: untick units that aren’t here, scan any extra ones you find.` : undefined}>
      {countingSerials && (
        <div className="space-y-4">
          <SerialPicker
            storeId={countStoreId}
            productId={countingSerials.productId}
            allowExtra
            value={serialCounts[countingSerials.productId] ?? countingSerials.serials ?? []}
            onChange={(serials) => {
              setSerialCounts((c) => ({ ...c, [countingSerials.productId]: serials }));
              setCounts((c) => ({ ...c, [countingSerials.productId]: serials.length }));
            }}
          />
          <p className="text-xs text-muted-foreground">
            System quantity {countingSerials.system}. Units not ticked are marked Lost when the stock take is posted;
            extra ones you scan go into stock.
          </p>
        </div>
      )}
      <DialogFooter>
        <Button onClick={() => {
          // Opening the list counts it: ticked-as-on-file is still a count.
          if (countingSerials && !serialCounts[countingSerials.productId]) {
            const all = countingSerials.serials ?? [];
            setSerialCounts((c) => ({ ...c, [countingSerials.productId]: all }));
            setCounts((c) => ({ ...c, [countingSerials.productId]: all.length }));
          }
          setCountingSerials(null);
        }}>Done</Button>
      </DialogFooter>
    </Dialog>

    <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} title="Review stock take"
      description="Only lines with a variance will post an adjustment." className="max-w-2xl">
      {review && (
        <div className="space-y-4">
          {review.adjusted === 0 ? (
            <p className="text-sm text-muted-foreground">No variances — nothing to post.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH className="text-right">System</TH>
                  <TH className="text-right">Counted</TH>
                  <TH className="text-right"><Hint tip="Counted minus the system quantity. Negative means stock is missing.">Variance</Hint></TH>
                </TR>
              </THead>
              <TBody>
                {review.lines.filter((l) => l.variance !== 0).map((l) => (
                  <TR key={l.productId}>
                    <TD className="font-medium">
                      {l.name}
                      {l.needsSerials && (
                        <span className="block text-xs text-destructive">Tick its units before posting</span>
                      )}
                    </TD>
                    <TD className="text-right text-muted-foreground">{l.system}</TD>
                    <TD className="text-right">{l.counted}</TD>
                    <TD className={cn('text-right font-medium', l.variance > 0 ? 'text-success' : 'text-destructive')}>
                      {l.variance > 0 ? '+' : ''}{l.variance}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={() => setReviewOpen(false)}>Back</Button>
        <Button loading={postTake.isPending}
          disabled={!review || review.adjusted === 0 || review.lines.some((l) => l.needsSerials)}
          onClick={() => postTake.mutate()}>
          Post stock take
        </Button>
      </DialogFooter>
    </Dialog>
    </>
  );
}
