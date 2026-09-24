'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Pencil, Trash2 } from 'lucide-react';
import { ProductsApi } from '@/api';
import type { ProductVariant } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorState } from '@/components/ui/misc';
import { formatMoney } from '@/lib/format';
import { useToast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { apiError } from '@/lib/api';

type Axis = { name: string; values: string };
const emptyAxes = (): Axis[] => [{ name: '', values: '' }];

type EditForm = { sku: string; barcode: string; sellingPrice: number; costPrice: number };
const toEditForm = (v: ProductVariant): EditForm => ({
  sku: v.sku ?? '',
  barcode: v.barcode ?? '',
  sellingPrice: Number(v.sellingPrice),
  costPrice: Number(v.costPrice),
});

/**
 * Size/colour-style variants for a product. Sits inside the product
 * create/edit dialog. A variant is a real product row (own SKU, price,
 * barcode, stock) under `parentId` — see `POST/GET /products/:id/variants`.
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
  const [axes, setAxes] = useState<Axis[]>(emptyAxes());
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
    setAxes(emptyAxes());
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

  const submitGenerate = () => {
    const options = axes
      .map((a) => ({
        name: a.name.trim(),
        values: Array.from(new Set(a.values.split(',').map((v) => v.trim()).filter(Boolean))),
      }))
      .filter((a) => a.name && a.values.length > 0);
    if (options.length === 0) {
      show('Add at least one attribute with a name and one or more values', 'error');
      return;
    }
    generate.mutate(options);
  };

  const setAxis = (i: number, key: keyof Axis, value: string) =>
    setAxes((a) => a.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)));
  const addAxis = () =>
    setAxes((a) => (a.length >= 3 ? a : [...a, { name: '', values: '' }]));
  const removeAxis = (i: number) => setAxes((a) => a.filter((_, idx) => idx !== i));

  const stockOf = (v: ProductVariant) =>
    v.stockItems.reduce((sum, s) => sum + Number(s.quantity), 0);

  if (!productId) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        Save the product first, then come back here to add size/colour variants.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">
          Variants {variants.length > 0 && <span className="text-muted-foreground">({variants.length})</span>}
        </span>
        {!generating && (
          <Button type="button" size="sm" variant="outline" onClick={() => setGenerating(true)}>
            <Plus className="h-3.5 w-3.5" /> Generate variants
          </Button>
        )}
      </div>

      {isError ? (
        <ErrorState onRetry={() => refetch()} description="Couldn't load variants. Check your connection and try again." />
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Loading variants…</p>
      ) : variants.length === 0 && !generating ? (
        <p className="text-sm text-muted-foreground">
          No variants yet — this product sells as a single item.
        </p>
      ) : (
        <ul className="space-y-2">
          {variants.map((v) =>
            editingId === v.id && editForm ? (
              <li key={v.id} className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{v.variantName}</span>
                  <Tooltip content="Cancel editing">
                    <Button type="button" size="icon" variant="ghost" aria-label="Cancel" onClick={closeEdit}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </Tooltip>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="SKU">
                    <Input
                      value={editForm.sku}
                      onChange={(e) => setEditForm((f) => f && { ...f, sku: e.target.value })}
                    />
                  </Field>
                  <Field label="Barcode">
                    <Input
                      value={editForm.barcode}
                      onChange={(e) => setEditForm((f) => f && { ...f, barcode: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Price">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editForm.sellingPrice}
                      onChange={(e) =>
                        setEditForm((f) => f && { ...f, sellingPrice: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Cost">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editForm.costPrice}
                      onChange={(e) =>
                        setEditForm((f) => f && { ...f, costPrice: Number(e.target.value) })
                      }
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
                    Save variant
                  </Button>
                </div>
              </li>
            ) : (
              <li
                key={v.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5 text-sm"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(v.attributes ?? {}).map(([name, value]) => (
                      <Badge key={name}>{name}: {value}</Badge>
                    ))}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    {v.sku && <span>SKU {v.sku}</span>}
                    {v.barcode && <span>Barcode {v.barcode}</span>}
                    <span>{formatMoney(v.sellingPrice)}</span>
                    <span>Stock {stockOf(v)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Tooltip content="Edit variant">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Edit variant"
                      onClick={() => openEdit(v)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </Tooltip>
                  {canDelete && (
                    <Tooltip content="Remove variant">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Remove variant"
                        onClick={() => setRemoveTarget(v)}
                      >
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

      {generating && (
        <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Generate variants</span>
            <Tooltip content="Cancel">
              <Button type="button" size="icon" variant="ghost" aria-label="Cancel" onClick={closeGenerate}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          </div>
          <p className="text-xs text-muted-foreground">
            One row per attribute, comma-separated values — e.g. Colour: Red, Blue and Size: S, M, L
            creates every combination. Re-running this later with a new value only adds what&apos;s missing.
          </p>

          <div className="space-y-2">
            {axes.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder="Attribute (e.g. Size)"
                  value={a.name}
                  onChange={(e) => setAxis(i, 'name', e.target.value)}
                />
                <Input
                  placeholder="Values (e.g. S, M, L)"
                  value={a.values}
                  onChange={(e) => setAxis(i, 'values', e.target.value)}
                />
                <Tooltip content="Remove attribute">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Remove attribute"
                    disabled={axes.length === 1}
                    onClick={() => removeAxis(i)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </Tooltip>
              </div>
            ))}
            {axes.length < 3 && (
              <button
                type="button"
                onClick={addAxis}
                className="text-xs font-medium text-primary hover:underline"
              >
                + Add attribute
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Price override (optional)">
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="Uses the product's price"
                value={priceOverride}
                onChange={(e) => setPriceOverride(e.target.value)}
              />
            </Field>
            <Field label="Cost override (optional)">
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="Uses the product's cost"
                value={costOverride}
                onChange={(e) => setCostOverride(e.target.value)}
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={closeGenerate}>
              Cancel
            </Button>
            <Button type="button" size="sm" loading={generate.isPending} onClick={submitGenerate}>
              Generate
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!removeTarget}
        title="Remove variant"
        description={removeTarget ? `Remove "${removeTarget.variantName}"?` : undefined}
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() => removeTarget && remove.mutate(removeTarget.id)}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
