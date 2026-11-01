'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Pencil, Plus, Trash2, X } from 'lucide-react';
import { ProductsApi } from '@/api';
import type { ProductVariant } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorState } from '@/components/ui/misc';
import { formatMoney } from '@/lib/format';
import { useToast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { apiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { combinations, comboKey, compareValues, splitValues } from '@/lib/variants';

/** One attribute being generated: its name, the values added so far, and what is being typed. */
type Axis = { name: string; values: string[]; draft: string };
const emptyAxis = (): Axis => ({ name: '', values: [], draft: '' });

type EditForm = { sku: string; barcode: string; sellingPrice: number; costPrice: number };
const toEditForm = (v: ProductVariant): EditForm => ({
  sku: v.sku ?? '',
  barcode: v.barcode ?? '',
  sellingPrice: Number(v.sellingPrice),
  costPrice: Number(v.costPrice),
});

/** Names offered for a new attribute; any other can be typed. */
const ATTRIBUTE_SUGGESTIONS = ['Size', 'Colour', 'Material', 'Style', 'Weight', 'Volume', 'Flavour'];

/**
 * Size/colour-style variants for a product. Sits inside the product
 * create/edit dialog. A variant is a real product row (own SKU, price,
 * barcode, stock) under `parentId` -- see `POST/GET /products/:id/variants`.
 *
 * Shown as one compact, sorted list -- sizes in shelf order -- rather than a
 * tall card per variant, with what each attribute is named once in the
 * header. Generating previews exactly what will be created before it is.
 */
export function VariantsSection({
  productId,
  canDelete,
}: {
  productId: string | null;
  canDelete: boolean;
}) {
  const qc = useQueryClient();
  const { show } = useToast();
  const [generating, setGenerating] = useState(false);
  const [axes, setAxes] = useState<Axis[]>([emptyAxis()]);
  const [priceOverride, setPriceOverride] = useState('');
  const [costOverride, setCostOverride] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ProductVariant | null>(null);

  const {
    data: variants = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['variants', productId],
    queryFn: () => ProductsApi.listVariants(productId!),
    enabled: !!productId,
  });

  // The attributes these variants are made of, named once for the whole list.
  const axisNames = useMemo(
    () => [...new Set(variants.flatMap((v) => Object.keys(v.attributes ?? {})))].sort((a, b) => a.localeCompare(b)),
    [variants],
  );
  const labelOf = (v: ProductVariant) =>
    axisNames.map((n) => v.attributes?.[n]).filter(Boolean).join(' · ') || v.variantName || 'Variant';
  const sorted = useMemo(
    () =>
      [...variants].sort((a, b) => {
        for (const n of axisNames) {
          const d = compareValues(a.attributes?.[n] ?? '', b.attributes?.[n] ?? '');
          if (d) return d;
        }
        return 0;
      }),
    [variants, axisNames],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['variants', productId] });
    qc.invalidateQueries({ queryKey: ['products'] });
  };

  const generate = useMutation({
    mutationFn: (options: { name: string; values: string[] }[]) =>
      ProductsApi.generateVariants(productId!, {
        options,
        sellingPrice: priceOverride ? Number(priceOverride) : undefined,
        costPrice: costOverride ? Number(costOverride) : undefined,
      }),
    onSuccess: (res) => {
      invalidate();
      show(
        res.skipped
          ? `Added ${res.created} variant(s), skipped ${res.skipped} that already existed`
          : `Added ${res.created} variant(s)`,
      );
      closeGenerate();
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const update = useMutation({
    mutationFn: (vars: { id: string; body: EditForm }) =>
      // An empty string would collide with every other blank sku/barcode under
      // the business's unique index; null is exempt from it, so that's what a
      // cleared field must send.
      ProductsApi.update(vars.id, {
        ...vars.body,
        sku: vars.body.sku.trim() || null,
        barcode: vars.body.barcode.trim() || null,
      }),
    onSuccess: () => {
      invalidate();
      show('Variant updated');
      closeEdit();
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => ProductsApi.remove(id),
    onSuccess: () => {
      invalidate();
      show('Variant removed');
      setRemoveTarget(null);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const closeGenerate = () => {
    setGenerating(false);
    setAxes([emptyAxis()]);
    setPriceOverride('');
    setCostOverride('');
  };
  const closeEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };
  const openEdit = (v: ProductVariant) => {
    setEditingId(v.id);
    setEditForm(toEditForm(v));
  };
  const openGenerate = () => {
    // Starting from the attributes already in use: adding a size is one value,
    // not retyping the whole set.
    setAxes(axisNames.length ? axisNames.map((name) => ({ name, values: [], draft: '' })) : [emptyAxis()]);
    setGenerating(true);
  };

  // What the generator would be sent: values typed but not yet added count too.
  const options = axes
    .map((a) => ({
      name: a.name.trim(),
      values: [...new Set([...a.values, ...splitValues(a.draft)])],
    }))
    .filter((a) => a.name && a.values.length > 0);
  // The same attributes on existing variants: a new value adds only the
  // combinations that are missing (the API skips the rest).
  const existing = useMemo(() => new Set(variants.map((v) => comboKey(v.attributes ?? {}))), [variants]);
  const combos = options.length ? combinations(options) : [];
  const fresh = combos.filter((c) => !existing.has(comboKey(c)));
  const tooMany = combos.length > 200;

  const setAxis = (i: number, patch: Partial<Axis>) =>
    setAxes((list) => list.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const commitDraft = (i: number) => {
    const a = axes[i];
    const add = splitValues(a.draft).filter((v) => !a.values.some((x) => x.toLowerCase() === v.toLowerCase()));
    setAxis(i, { values: [...a.values, ...add], draft: '' });
  };

  const stockOf = (v: ProductVariant) => v.stockItems.reduce((sum, s) => sum + Number(s.quantity), 0);

  if (!productId) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        <Layers className="mt-0.5 h-4 w-4 shrink-0" />
        Save the product first, then come back here to add sizes, colours or other variants.
      </div>
    );
  }

  return (
    <section className="space-y-3" aria-labelledby="variants-title" data-testid="variants">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 id="variants-title" className="text-sm font-medium text-foreground">
            Variants {variants.length > 0 && <span className="text-muted-foreground">({variants.length})</span>}
          </h3>
          {axisNames.length > 0 && <p className="text-xs text-muted-foreground">{axisNames.join(' · ')}</p>}
        </div>
        {!generating && (
          <Button type="button" size="sm" variant="outline" onClick={openGenerate}>
            <Plus className="h-3.5 w-3.5" /> {variants.length ? 'Add variants' : 'Create variants'}
          </Button>
        )}
      </div>

      {generating && (
        <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{variants.length ? 'Add variants' : 'Create variants'}</span>
            <Tooltip content="Cancel">
              <Button type="button" size="icon" variant="ghost" aria-label="Cancel" onClick={closeGenerate}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          </div>
          <p className="text-xs text-muted-foreground">
            Name each attribute and add its values — press Enter or a comma after each. Every combination becomes
            a variant with its own SKU, price and stock.
          </p>

          <datalist id="variant-attribute-names">
            {ATTRIBUTE_SUGGESTIONS.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>

          <div className="space-y-2">
            {axes.map((a, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 rounded-md border border-border bg-card p-2 sm:grid-cols-[9rem_1fr_auto]">
                <Input
                  aria-label={`Attribute ${i + 1} name`}
                  list="variant-attribute-names"
                  placeholder="e.g. Size"
                  value={a.name}
                  onChange={(e) => setAxis(i, { name: e.target.value })}
                />
                {/* Values as chips: each one visible and removable on its own,
                    rather than one comma-separated string to proofread. */}
                <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 focus-within:ring-2 focus-within:ring-ring">
                  {a.values.map((v) => (
                    <span key={v} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {v}
                      <button
                        type="button"
                        aria-label={`Remove ${v}`}
                        className="rounded-full hover:bg-primary/20"
                        onClick={() => setAxis(i, { values: a.values.filter((x) => x !== v) })}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    aria-label={`${a.name || `Attribute ${i + 1}`} values`}
                    className="min-w-24 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
                    placeholder={a.values.length ? 'Add another…' : 'e.g. S, M, L'}
                    value={a.draft}
                    onChange={(e) => {
                      // A comma (typed or pasted) completes the values before it.
                      if (e.target.value.includes(',')) {
                        const parts = splitValues(e.target.value);
                        const ended = e.target.value.trim().endsWith(',');
                        const keep = ended ? [] : parts.slice(-1);
                        const add = (ended ? parts : parts.slice(0, -1)).filter(
                          (v) => !a.values.some((x) => x.toLowerCase() === v.toLowerCase()),
                        );
                        setAxis(i, { values: [...a.values, ...add], draft: keep.join('') });
                      } else {
                        setAxis(i, { draft: e.target.value });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        // Enter adds the value; it must not submit the product form.
                        e.preventDefault();
                        commitDraft(i);
                      } else if (e.key === 'Backspace' && !a.draft && a.values.length) {
                        setAxis(i, { values: a.values.slice(0, -1) });
                      }
                    }}
                    onBlur={() => commitDraft(i)}
                  />
                </div>
                <Tooltip content="Remove attribute">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Remove attribute"
                    disabled={axes.length === 1}
                    onClick={() => setAxes((list) => list.filter((_, idx) => idx !== i))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </Tooltip>
              </div>
            ))}
            {axes.length < 3 && (
              <button
                type="button"
                onClick={() => setAxes((list) => [...list, emptyAxis()])}
                className="text-xs font-medium text-primary hover:underline"
              >
                + Add another attribute
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Price for new variants">
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="Same as the product"
                value={priceOverride}
                onChange={(e) => setPriceOverride(e.target.value)}
              />
            </Field>
            <Field label="Cost for new variants">
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="Same as the product"
                value={costOverride}
                onChange={(e) => setCostOverride(e.target.value)}
              />
            </Field>
          </div>

          {/* Exactly what Generate will do, before it does it. */}
          {combos.length > 0 && (
            <div className="rounded-md bg-card p-2 text-xs">
              {tooMany ? (
                <p className="text-destructive">
                  That makes {combos.length} combinations. Keep it under 200.
                </p>
              ) : fresh.length === 0 ? (
                <p className="text-muted-foreground">All {combos.length} already exist — add a new value.</p>
              ) : (
                <>
                  <p className="mb-1.5 text-muted-foreground">
                    Will create {fresh.length} new
                    {combos.length > fresh.length ? ` (${combos.length - fresh.length} already exist)` : ''}:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {fresh.slice(0, 24).map((c) => (
                      <span key={comboKey(c)} className="rounded border border-border px-1.5 py-0.5">
                        {Object.values(c).join(' · ')}
                      </span>
                    ))}
                    {fresh.length > 24 && <span className="px-1 py-0.5 text-muted-foreground">+{fresh.length - 24} more</span>}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={closeGenerate}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              loading={generate.isPending}
              disabled={fresh.length === 0 || tooMany}
              onClick={() => generate.mutate(options)}
            >
              {fresh.length ? `Create ${fresh.length} variant${fresh.length === 1 ? '' : 's'}` : 'Create variants'}
            </Button>
          </div>
        </div>
      )}

      {isError ? (
        <ErrorState onRetry={() => refetch()} description="Couldn't load variants. Check your connection and try again." />
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Loading variants…</p>
      ) : variants.length === 0 ? (
        !generating && (
          <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
            No variants — this product sells as a single item. Add sizes, colours or other options to sell each
            one with its own SKU, price and stock.
          </p>
        )
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {sorted.map((v) =>
            editingId === v.id && editForm ? (
              <li key={v.id} className="space-y-3 bg-muted/30 p-3">
                <div className="text-sm font-medium">{labelOf(v)}</div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="SKU">
                    <Input value={editForm.sku} onChange={(e) => setEditForm((f) => f && { ...f, sku: e.target.value })} />
                  </Field>
                  <Field label="Barcode">
                    <Input value={editForm.barcode} onChange={(e) => setEditForm((f) => f && { ...f, barcode: e.target.value })} />
                  </Field>
                  <Field label="Price">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editForm.sellingPrice}
                      onChange={(e) => setEditForm((f) => f && { ...f, sellingPrice: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Cost">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editForm.costPrice}
                      onChange={(e) => setEditForm((f) => f && { ...f, costPrice: Number(e.target.value) })}
                    />
                  </Field>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={closeEdit}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    loading={update.isPending}
                    onClick={() => editForm && update.mutate({ id: v.id, body: editForm })}
                  >
                    Save
                  </Button>
                </div>
              </li>
            ) : (
              // On a phone the name takes the first line in full and the
              // figures and actions sit under it; side by side they cut the
              // name to "Blue …".
              <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                  <div className="truncate font-medium">{labelOf(v)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[v.sku && `SKU ${v.sku}`, v.barcode && `Barcode ${v.barcode}`].filter(Boolean).join(' · ') || (
                      <span className="italic">No SKU or barcode</span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 tabular-nums sm:ml-0">{formatMoney(v.sellingPrice)}</span>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-center text-xs tabular-nums',
                    stockOf(v) > 0 ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
                  )}
                  title="Across all stores"
                >
                  {stockOf(v) > 0 ? `${stockOf(v)} in stock` : 'Out of stock'}
                </span>
                <div className="ml-auto flex shrink-0">
                  <Tooltip content="Edit variant">
                    <Button type="button" size="icon" variant="ghost" aria-label={`Edit ${labelOf(v)}`} onClick={() => openEdit(v)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </Tooltip>
                  {canDelete && (
                    <Tooltip content="Remove variant">
                      <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${labelOf(v)}`} onClick={() => setRemoveTarget(v)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </Tooltip>
                  )}
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      <ConfirmDialog
        open={!!removeTarget}
        title="Remove variant"
        description={removeTarget ? `Remove "${labelOf(removeTarget)}"?` : undefined}
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() => removeTarget && remove.mutate(removeTarget.id)}
        onCancel={() => setRemoveTarget(null)}
      />
    </section>
  );
}
