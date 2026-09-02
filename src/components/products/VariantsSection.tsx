'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Pencil, Trash2 } from 'lucide-react';
import { VariantsMockApi, type VariantInput } from '@/api/variantsMock';
import type { ProductVariant, VariantAttribute } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatMoney } from '@/lib/format';
import { useToast } from '@/components/ui/toast';

const emptyForm = (defaults: { price: number; costPrice: number }): VariantInput => ({
  attributes: [{ name: '', value: '' }],
  sku: '',
  barcode: '',
  price: defaults.price,
  costPrice: defaults.costPrice,
  stock: 0,
});

/**
 * Size/colour-style variants for a product. Sits inside the product
 * create/edit dialog. Backed by a localStorage mock (`variantsMock.ts`) until
 * a real API exists — see Tasks.md #15.
 */
export function VariantsSection({
  productId,
  defaultPrice,
  defaultCostPrice,
}: {
  productId: string | null;
  defaultPrice: number;
  defaultCostPrice: number;
}) {
  const qc = useQueryClient();
  const { show } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<VariantInput>(emptyForm({ price: defaultPrice, costPrice: defaultCostPrice }));
  const [removeTarget, setRemoveTarget] = useState<ProductVariant | null>(null);

  const { data: variants = [], isLoading } = useQuery({
    queryKey: ['variants', productId],
    queryFn: () => VariantsMockApi.listByProduct(productId!),
    enabled: !!productId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['variants', productId] });
    qc.invalidateQueries({ queryKey: ['variants-all'] });
  };

  const create = useMutation({
    mutationFn: (body: VariantInput) => VariantsMockApi.create(productId!, body),
    onSuccess: () => {
      invalidate();
      show('Variant added');
      closeForm();
    },
  });
  const update = useMutation({
    mutationFn: (vars: { id: string; body: VariantInput }) => VariantsMockApi.update(vars.id, vars.body),
    onSuccess: () => {
      invalidate();
      show('Variant updated');
      closeForm();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => VariantsMockApi.remove(id),
    onSuccess: () => {
      invalidate();
      show('Variant removed');
      setRemoveTarget(null);
    },
  });

  const closeForm = () => {
    setAdding(false);
    setEditingId(null);
    setForm(emptyForm({ price: defaultPrice, costPrice: defaultCostPrice }));
  };

  const openAdd = () => {
    setForm(emptyForm({ price: defaultPrice, costPrice: defaultCostPrice }));
    setEditingId(null);
    setAdding(true);
  };

  const openEdit = (v: ProductVariant) => {
    setForm({
      attributes: v.attributes.length ? v.attributes : [{ name: '', value: '' }],
      sku: v.sku ?? '',
      barcode: v.barcode ?? '',
      price: v.price,
      costPrice: v.costPrice,
      stock: v.stock,
    });
    setEditingId(v.id);
    setAdding(true);
  };

  const setAttr = (i: number, key: keyof VariantAttribute, value: string) =>
    setForm((f) => ({
      ...f,
      attributes: f.attributes.map((a, idx) => (idx === i ? { ...a, [key]: value } : a)),
    }));
  const addAttr = () =>
    setForm((f) => ({ ...f, attributes: [...f.attributes, { name: '', value: '' }] }));
  const removeAttr = (i: number) =>
    setForm((f) => ({ ...f, attributes: f.attributes.filter((_, idx) => idx !== i) }));

  const submit = () => {
    const cleanAttrs = form.attributes
      .map((a) => ({ name: a.name.trim(), value: a.value.trim() }))
      .filter((a) => a.name && a.value);
    if (cleanAttrs.length === 0) {
      show('Add at least one attribute (e.g. Size: M)', 'error');
      return;
    }
    const body: VariantInput = { ...form, attributes: cleanAttrs };
    if (editingId) update.mutate({ id: editingId, body });
    else create.mutate(body);
  };

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
        {!adding && (
          <Button type="button" size="sm" variant="outline" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5" /> Add variant
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading variants…</p>
      ) : variants.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground">
          No variants yet — this product sells as a single item.
        </p>
      ) : (
        <ul className="space-y-2">
          {variants.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5 text-sm"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap gap-1">
                  {v.attributes.map((a, i) => (
                    <Badge key={i}>{a.name}: {a.value}</Badge>
                  ))}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  {v.sku && <span>SKU {v.sku}</span>}
                  {v.barcode && <span>Barcode {v.barcode}</span>}
                  <span>{formatMoney(v.price)}</span>
                  <span>Stock {v.stock}</span>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Edit variant"
                  onClick={() => openEdit(v)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Remove variant"
                  onClick={() => setRemoveTarget(v)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{editingId ? 'Edit variant' : 'New variant'}</span>
            <Button type="button" size="icon" variant="ghost" aria-label="Cancel" onClick={closeForm}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="space-y-2">
            {form.attributes.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder="Attribute (e.g. Size)"
                  value={a.name}
                  onChange={(e) => setAttr(i, 'name', e.target.value)}
                />
                <Input
                  placeholder="Value (e.g. M)"
                  value={a.value}
                  onChange={(e) => setAttr(i, 'value', e.target.value)}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Remove attribute"
                  disabled={form.attributes.length === 1}
                  onClick={() => removeAttr(i)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <button
              type="button"
              onClick={addAttr}
              className="text-xs font-medium text-primary hover:underline"
            >
              + Add attribute
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="SKU">
              <Input value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
            </Field>
            <Field label="Barcode">
              <Input value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Price">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
              />
            </Field>
            <Field label="Cost">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.costPrice}
                onChange={(e) => setForm((f) => ({ ...f, costPrice: Number(e.target.value) }))}
              />
            </Field>
            <Field label="Stock">
              <Input
                type="number"
                min="0"
                value={form.stock}
                onChange={(e) => setForm((f) => ({ ...f, stock: Number(e.target.value) }))}
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={closeForm}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              loading={create.isPending || update.isPending}
              onClick={submit}
            >
              {editingId ? 'Save variant' : 'Add variant'}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!removeTarget}
        title="Remove variant"
        description={
          removeTarget
            ? `Remove "${removeTarget.attributes.map((a) => `${a.name}: ${a.value}`).join(', ')}"?`
            : undefined
        }
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() => removeTarget && remove.mutate(removeTarget.id)}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
