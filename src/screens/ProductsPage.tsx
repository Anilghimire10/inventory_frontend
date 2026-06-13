'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Pencil, Trash2, Package } from 'lucide-react';
import { CategoriesApi, ProductsApi } from '@/api';
import type { Product } from '@/types';
import { PageHeader, LoadingBlock, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useAuth } from '@/auth/AuthContext';
import { can } from '@/lib/permissions';

const empty = {
  name: '',
  sku: '',
  barcode: '',
  brand: '',
  categoryId: '',
  unit: 'pcs',
  costPrice: 0,
  sellingPrice: 0,
  taxRate: 0,
  reorderLevel: 0,
  isRxRequired: false,
  trackBatches: false,
};
type Form = typeof empty;

export default function ProductsPage() {
  const qc = useQueryClient();
  const { show } = useToast();
  const { user } = useAuth();
  const canDelete = !!user && can.deleteCatalog(user.role);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Form>(empty);

  const { data, isLoading } = useQuery({
    queryKey: ['products', search, page],
    queryFn: () => ProductsApi.list({ search: search || undefined, page, limit: 20 }),
  });
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => CategoriesApi.list(),
  });

  const save = useMutation({
    mutationFn: (body: Form) => {
      const payload = { ...body, categoryId: body.categoryId || undefined };
      return editing
        ? ProductsApi.update(editing.id, payload)
        : ProductsApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      show(editing ? 'Product updated' : 'Product created');
      setOpen(false);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => ProductsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      show('Product removed');
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      sku: p.sku ?? '',
      barcode: p.barcode ?? '',
      brand: p.brand ?? '',
      categoryId: p.categoryId ?? '',
      unit: p.unit,
      costPrice: Number(p.costPrice),
      sellingPrice: Number(p.sellingPrice),
      taxRate: Number(p.taxRate),
      reorderLevel: p.reorderLevel,
      isRxRequired: p.isRxRequired,
      trackBatches: p.trackBatches,
    });
    setOpen(true);
  };

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div>
      <PageHeader
        title="Products"
        description="Your catalog of items for sale."
        action={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add product
          </Button>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search name, SKU, barcode…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          title="No products yet"
          description="Add your first product to start tracking stock and selling."
          icon={Package}
          action={<Button onClick={openCreate}><Plus className="h-4 w-4" /> Add product</Button>}
        />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>SKU</TH>
                <TH>Category</TH>
                <TH className="text-right">Cost</TH>
                <TH className="text-right">Price</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {data.data.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <div className="font-medium">{p.name}</div>
                    <div className="flex gap-1 pt-1">
                      {p.isRxRequired && <Badge tone="destructive">Rx</Badge>}
                      {p.trackBatches && <Badge tone="warning">Batch</Badge>}
                    </div>
                  </TD>
                  <TD className="text-muted-foreground">{p.sku || '—'}</TD>
                  <TD>{p.category?.name ?? '—'}</TD>
                  <TD className="text-right">{formatMoney(p.costPrice)}</TD>
                  <TD className="text-right font-medium">{formatMoney(p.sellingPrice)}</TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {canDelete && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            confirm(`Remove "${p.name}"?`) && remove.mutate(p.id)
                          }
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination
            page={data.meta.page}
            pages={data.meta.pages}
            onPage={setPage}
          />
        </>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit product' : 'New product'}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(form);
          }}
          className="space-y-4"
        >
          <Field label="Name">
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="SKU">
              <Input value={form.sku} onChange={(e) => set('sku', e.target.value)} />
            </Field>
            <Field label="Barcode">
              <Input value={form.barcode} onChange={(e) => set('barcode', e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                <option value="">— None —</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Unit">
              <Input value={form.unit} onChange={(e) => set('unit', e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Cost price">
              <Input type="number" step="0.01" min="0" value={form.costPrice}
                onChange={(e) => set('costPrice', Number(e.target.value))} />
            </Field>
            <Field label="Selling price">
              <Input type="number" step="0.01" min="0" value={form.sellingPrice}
                onChange={(e) => set('sellingPrice', Number(e.target.value))} />
            </Field>
            <Field label="Tax %">
              <Input type="number" step="0.01" min="0" value={form.taxRate}
                onChange={(e) => set('taxRate', Number(e.target.value))} />
            </Field>
          </div>
          <Field label="Reorder level">
            <Input type="number" min="0" value={form.reorderLevel}
              onChange={(e) => set('reorderLevel', Number(e.target.value))} />
          </Field>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isRxRequired}
                onChange={(e) => set('isRxRequired', e.target.checked)} />
              Prescription required (Rx)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.trackBatches}
                onChange={(e) => set('trackBatches', e.target.checked)} />
              Track batches / expiry
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {editing ? 'Save changes' : 'Create product'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}

export function Pagination({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-2">
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <span className="text-sm text-muted-foreground">
        Page {page} of {pages}
      </span>
      <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </div>
  );
}