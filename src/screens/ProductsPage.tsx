'use client';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Pencil, Trash2, Package, Download, Upload, X, Check } from 'lucide-react';
import { CategoriesApi, ProductsApi, TaxesApi } from '@/api';
import type { Category, Product } from '@/types';
import { PageHeader, LoadingBlock, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RxBadge } from '@/components/ui/RxBadge';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { exportCsv, parseCsv } from '@/lib/csv';
import { Select } from '@/components/ui/select';
import { formatMoney } from '@/lib/format';
import { useAuth } from '@/auth/AuthContext';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';

const empty = {
  name: '',
  sku: '',
  barcode: '',
  brand: '',
  categoryIds: [] as string[],
  taxId: '',
  imageUrl: '',
  expiryDate: '',
  unit: 'pcs',
  costPrice: 0,
  sellingPrice: 0,
  taxRate: 0,
  isTaxable: true,
  reorderLevel: 0,
  isRxRequired: false,
  trackBatches: false,
};
type Form = typeof empty;

const EXPORT_COLUMNS = [
  { key: 'name', label: 'name' },
  { key: 'sku', label: 'sku' },
  { key: 'barcode', label: 'barcode' },
  { key: 'brand', label: 'brand' },
  { key: 'unit', label: 'unit' },
  { key: 'costPrice', label: 'costPrice' },
  { key: 'sellingPrice', label: 'sellingPrice' },
  { key: 'taxRate', label: 'taxRate' },
  { key: 'reorderLevel', label: 'reorderLevel' },
  { key: 'categories', label: 'categories' },
];

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
  const { data: taxes } = useQuery({ queryKey: ['taxes'], queryFn: () => TaxesApi.list() });

  const save = useMutation({
    mutationFn: (body: Form) => {
      const payload = {
        ...body,
        taxId: body.taxId || undefined,
        imageUrl: body.imageUrl || undefined,
        expiryDate: body.expiryDate
          ? new Date(body.expiryDate).toISOString()
          : undefined,
      };
      return editing
        ? ProductsApi.update(editing.id, payload)
        : ProductsApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
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
      categoryIds: p.categories?.map((c) => c.id) ?? [],
      taxId: p.taxId ?? '',
      imageUrl: p.imageUrl ?? '',
      // <input type="date"> wants a yyyy-mm-dd value.
      expiryDate: p.expiryDate ? p.expiryDate.slice(0, 10) : '',
      unit: p.unit,
      costPrice: Number(p.costPrice),
      sellingPrice: Number(p.sellingPrice),
      taxRate: Number(p.taxRate),
      isTaxable: p.isTaxable ?? true,
      reorderLevel: p.reorderLevel,
      isRxRequired: p.isRxRequired,
      trackBatches: p.trackBatches,
    });
    setOpen(true);
  };

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // When a tax is picked, snapshot its rate for display.
  const onPickTax = (taxId: string) => {
    const t = taxes?.find((x) => x.id === taxId);
    setForm((f) => ({ ...f, taxId, taxRate: t ? Number(t.rate) : 0 }));
  };

  // ---- Import / export ----
  const importRef = useRef<HTMLInputElement>(null);
  const doExport = async () => {
    const rows = await ProductsApi.exportAll();
    exportCsv('products', EXPORT_COLUMNS, rows);
  };
  const importMut = useMutation({
    mutationFn: (items: Record<string, unknown>[]) => ProductsApi.importProducts(items),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      const errs = res.errors.length ? `, ${res.errors.length} skipped` : '';
      show(`Imported: ${res.created} new, ${res.updated} updated${errs}`, res.errors.length ? 'error' : 'success');
    },
    onError: (e) => show(apiError(e), 'error'),
  });
  const onPickImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) { show('No rows found in that file', 'error'); return; }
      importMut.mutate(rows);
    } catch (err) {
      show(apiError(err), 'error');
    } finally {
      e.target.value = '';
    }
  };

  const toggleCategory = (id: string) =>
    setForm((f) => ({
      ...f,
      categoryIds: f.categoryIds.includes(id)
        ? f.categoryIds.filter((c) => c !== id)
        : [...f.categoryIds, id],
    }));

  const [uploading, setUploading] = useState(false);
  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { imageUrl } = await ProductsApi.uploadImage(file);
      set('imageUrl', imageUrl);
    } catch (err) {
      show(apiError(err), 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div>
      <PageHeader
        title="Products"
        description="Your catalog of items for sale."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={doExport}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button variant="outline" loading={importMut.isPending} onClick={() => importRef.current?.click()}>
              <Upload className="h-4 w-4" /> Import
            </Button>
            <input ref={importRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onPickImport} />
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add product
            </Button>
          </div>
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
                    <div className="flex items-center gap-3">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          className="h-9 w-9 shrink-0 rounded-md border border-border object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                          <Package className="h-4 w-4" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{p.name}</span>
                          {p.isRxRequired && <RxBadge />}
                        </div>
                        <div className="flex gap-1 pt-1">
                          {p.trackBatches && <Badge tone="warning">Batch</Badge>}
                        </div>
                      </div>
                    </div>
                  </TD>
                  <TD className="text-muted-foreground">{p.sku || '—'}</TD>
                  <TD>
                    {p.categories && p.categories.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {p.categories.map((c) => (
                          <Badge key={c.id}>{c.name}</Badge>
                        ))}
                      </div>
                    ) : (
                      '—'
                    )}
                  </TD>
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
          <Field label="Categories">
            {!categories || categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No categories yet — create some on the Categories page.
              </p>
            ) : (
              <CategoryMultiSelect
                categories={categories}
                selected={form.categoryIds}
                onToggle={toggleCategory}
              />
            )}
          </Field>

          <Field label="Product image">
            <div className="flex items-center gap-3">
              {form.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.imageUrl}
                  alt="Product"
                  className="h-16 w-16 rounded-md border border-border object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
                  <Package className="h-5 w-5" />
                </div>
              )}
              <div className="flex flex-col gap-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={onPickImage}
                  disabled={uploading}
                  className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
                />
                {form.imageUrl && (
                  <button
                    type="button"
                    onClick={() => set('imageUrl', '')}
                    className="self-start text-xs text-destructive hover:underline"
                  >
                    Remove image
                  </button>
                )}
                {uploading && (
                  <span className="text-xs text-muted-foreground">Uploading…</span>
                )}
              </div>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Unit">
              <Input value={form.unit} onChange={(e) => set('unit', e.target.value)} />
            </Field>
            <Field label="Expiry date">
              <Input
                type="date"
                value={form.expiryDate}
                onChange={(e) => set('expiryDate', e.target.value)}
              />
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
            <Field label="Tax">
              <Select value={form.taxId} onChange={(e) => onPickTax(e.target.value)}>
                <option value="">No tax (0%)</option>
                {taxes?.filter((t) => t.isActive).map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({Number(t.rate)}%)</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Reorder level">
            <Input type="number" min="0" value={form.reorderLevel}
              onChange={(e) => set('reorderLevel', Number(e.target.value))} />
          </Field>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isTaxable}
                onChange={(e) => set('isTaxable', e.target.checked)} />
              Taxable
            </label>
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

/**
 * Searchable multi-select for categories. Selected categories show as removable
 * chips; typing filters a scrollable dropdown, so it scales to many categories.
 */
function CategoryMultiSelect({
  categories,
  selected,
  onToggle,
}: {
  categories: Category[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const selectedCats = categories.filter((c) => selected.includes(c.id));
  const q = query.trim().toLowerCase();
  const filtered = q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : categories;

  return (
    <div ref={ref} className="relative">
      {selectedCats.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectedCats.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-2.5 py-0.5 text-sm text-primary"
            >
              {c.name}
              <button
                type="button"
                onClick={() => onToggle(c.id)}
                className="rounded-full hover:text-primary/70"
                aria-label={`Remove ${c.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search categories…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && (
        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-border bg-card shadow-md">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No categories match.</p>
          ) : (
            filtered.map((c) => {
              const isSel = selected.includes(c.id);
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => onToggle(c.id)}
                  className={cn(
                    'flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent',
                    isSel && 'font-medium text-primary',
                  )}
                >
                  {c.name}
                  {isSel && <Check className="h-4 w-4" />}
                </button>
              );
            })
          )}
        </div>
      )}
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