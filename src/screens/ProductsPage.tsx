'use client';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Pencil, Trash2, Package, Download, Upload, X, Check, Barcode as BarcodeIcon } from 'lucide-react';
import { CategoriesApi, ProductsApi, TaxesApi } from '@/api';
import { VariantsSection } from '@/components/products/VariantsSection';
import { StoreAvailability } from '@/components/products/StoreAvailability';
import { ProductDetailsDialog } from '@/components/products/ProductDetailsDialog';
import type { Category, Product } from '@/types';
import { PageHeader, LoadingBlock, EmptyState, ErrorState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RxBadge } from '@/components/ui/RxBadge';
import { ExpiryBadge } from '@/components/ExpiryBadge';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { useStoreScope } from '@/store/StoreContext';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { exportCsv } from '@/lib/csv';
import { ImportDialog } from '@/components/ImportDialog';
import { printLabelSheet } from '@/lib/print';
import { generateBarcodeValue } from '@/lib/barcode';
import { Select } from '@/components/ui/select';
import { Tooltip } from '@/components/ui/tooltip';
import { UNITS } from '@/lib/units';
import { formatDate, formatMoney } from '@/lib/format';
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
  trackSerials: false,
};
type Form = typeof empty;

/**
 * The product file's columns, export and import alike: export, edit in
 * Excel, import back, and only what was edited changes. The headings are the
 * ones the import reads.
 */
const PRODUCT_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'sku', label: 'SKU' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'brand', label: 'Brand' },
  { key: 'description', label: 'Description' },
  { key: 'unit', label: 'Unit' },
  { key: 'costPrice', label: 'Cost price' },
  { key: 'sellingPrice', label: 'Selling price' },
  { key: 'taxRate', label: 'Tax rate' },
  { key: 'isTaxable', label: 'Taxable' },
  { key: 'reorderLevel', label: 'Minimum stock' },
  { key: 'categories', label: 'Categories' },
  { key: 'isRxRequired', label: 'Prescription' },
  { key: 'expiryDate', label: 'Expiry date' },
  { key: 'trackBatches', label: 'Track batches' },
  { key: 'trackSerials', label: 'Track serials' },
];

const PRODUCT_TEMPLATE = [
  {
    name: 'Basmati rice 1kg', sku: 'RICE-1KG', barcode: '8901234567890', brand: 'Daawat', description: '',
    unit: 'pcs', costPrice: 180, sellingPrice: 220, taxRate: 13, isTaxable: 'yes', reorderLevel: 10,
    categories: 'Grocery|Rice', isRxRequired: 'no', expiryDate: '2027-06-30', trackBatches: 'no', trackSerials: 'no',
  },
  {
    name: 'Samsung Galaxy A15', sku: 'SAM-A15', barcode: '', brand: 'Samsung', description: '4GB/128GB',
    unit: 'pcs', costPrice: 21000, sellingPrice: 24999, taxRate: 13, isTaxable: 'yes', reorderLevel: 2,
    categories: 'Mobiles', isRxRequired: 'no', expiryDate: '', trackBatches: 'no', trackSerials: 'yes',
  },
];

const PRODUCT_IMPORT_HELP = [
  { name: 'Name', required: true, note: 'required for new products' },
  { name: 'SKU', note: 'your product code; a row whose SKU (or, without one, barcode) already exists updates that product' },
  { name: 'Barcode, Brand, Description', note: 'text' },
  { name: 'Unit', note: 'pcs, kg, g, l, ml, box, pack … (blank = pcs for a new product)' },
  { name: 'Cost price, Selling price', note: 'amounts; "1,200" and "Rs 1,200" are fine' },
  { name: 'Tax rate', note: 'percent, e.g. 13' },
  { name: 'Taxable, Prescription', note: 'yes or no' },
  { name: 'Minimum stock', note: 'the low-stock warning level' },
  { name: 'Categories', note: 'one or more, separated by | (created if new)' },
  { name: 'Expiry date', note: 'like 2027-06-30' },
  { name: 'Track batches, Track serials', note: 'yes or no; only used for new products' },
];

export default function ProductsPage() {
  const qc = useQueryClient();
  const { show } = useToast();
  const { user } = useAuth();
  const canDelete = !!user && can.deleteCatalog(user.role);
  const [search, setSearch] = useState('');
  // App-wide selection: switching in the header moves this page too.
  const { storeId } = useStoreScope();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [removeTarget, setRemoveTarget] = useState<Product | null>(null);
  // The product whose details are open (a row click, as on Sales).
  const [detailsOf, setDetailsOf] = useState<Product | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // A branch switch can land you past the end of the new catalog, and a
  // selection made in one branch does not belong to another. Adjusted during
  // render (React's documented pattern) rather than in an effect.
  const [prevStore, setPrevStore] = useState(storeId);
  if (prevStore !== storeId) {
    setPrevStore(storeId);
    setPage(1);
    setSelected(new Set());
  }

  const [expiry, setExpiry] = useState<'' | 'expired' | 'soon'>('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['products', search, page, storeId, expiry],
    queryFn: () =>
      ProductsApi.list({
        search: search || undefined,
        page,
        limit: 20,
        excludeVariants: true,
        storeId: storeId || undefined,
        expiry: expiry || undefined,
      }),
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
        // null, not absent: "No tax" has to clear a tax the product had, or
        // the old one stays attached and comes back the next time it's opened.
        taxId: body.taxId || null,
        imageUrl: body.imageUrl || undefined,
        // The unique indexes treat two empty strings as a collision, so a
        // blank SKU/barcode has to go up as absent, not as ''.
        sku: body.sku || undefined,
        barcode: body.barcode || undefined,
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

  const toggleSelected = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleSelectAll = (rows: Product[]) =>
    setSelected((s) =>
      rows.every((p) => s.has(p.id)) ? new Set() : new Set(rows.map((p) => p.id)),
    );

  // Assign a barcode to any selected product that doesn't have one yet (so the
  // printed label is actually scannable), then print the whole selection.
  const printLabels = useMutation({
    mutationFn: async (products: Product[]) => {
      let assignedAny = false;
      const items = [];
      for (const p of products) {
        let barcode = p.barcode;
        if (!barcode) {
          // Retry on the rare collision against the business's existing codes.
          for (let attempt = 0; !barcode && attempt < 3; attempt++) {
            const candidate = generateBarcodeValue();
            try {
              const updated = await ProductsApi.update(p.id, { barcode: candidate });
              barcode = updated.barcode ?? candidate;
              assignedAny = true;
            } catch {
              if (attempt === 2) throw new Error(`Could not assign a barcode to "${p.name}"`);
            }
          }
        }
        items.push({
          name: p.name,
          barcode: barcode!,
          price: formatMoney(p.sellingPrice),
          sku: p.sku,
        });
      }
      return { items, assignedAny };
    },
    onSuccess: ({ items, assignedAny }) => {
      if (assignedAny) qc.invalidateQueries({ queryKey: ['products'] });
      printLabelSheet(items);
      setSelected(new Set());
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
      trackSerials: p.trackSerials,
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
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const doExport = async () => {
    setExporting(true);
    try {
      const rows = await ProductsApi.exportAll();
      await exportCsv(`products_${new Date().toISOString().slice(0, 10)}`, PRODUCT_COLUMNS, rows);
    } catch (e) {
      show(apiError(e), 'error');
    } finally {
      setExporting(false);
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
            {selected.size > 0 && (
              <Button
                variant="outline"
                loading={printLabels.isPending}
                onClick={() => {
                  const rows = (data?.data ?? []).filter((p) => selected.has(p.id));
                  printLabels.mutate(rows);
                }}
              >
                <BarcodeIcon className="h-4 w-4" /> Print labels ({selected.size})
              </Button>
            )}
            <Button variant="outline" loading={exporting} onClick={doExport}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button variant="outline" onClick={() => setImporting(true)}>
              <Upload className="h-4 w-4" /> Import
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add product
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search name, SKU, barcode…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
              setSelected(new Set());
            }}
          />
        </div>
        <div className="w-44">
          <Select
            aria-label="Expiry"
            value={expiry}
            onChange={(e) => {
              setExpiry(e.target.value as '' | 'expired' | 'soon');
              setPage(1);
              setSelected(new Set());
            }}
          >
            <option value="">Any expiry</option>
            <option value="expired">Expired</option>
            <option value="soon">Expiring in 30 days</option>
          </Select>
        </div>
      </div>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : (!data || data.data.length === 0) && expiry ? (
        <EmptyState
          title={expiry === 'expired' ? 'Nothing has expired' : 'Nothing expires in the next 30 days'}
          description={search ? 'Nothing matches the search, either.' : undefined}
          icon={Package}
        />
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
                <TH className="w-8">
                  <input
                    type="checkbox"
                    className="h-5 w-5 sm:h-4 sm:w-4"
                    aria-label="Select all on this page"
                    checked={data.data.length > 0 && data.data.every((p) => selected.has(p.id))}
                    onChange={() => toggleSelectAll(data.data)}
                  />
                </TH>
                <TH>Name</TH>
                {/* Phones drop these so price and the actions stay on screen. */}
                <TH className="hidden md:table-cell">SKU</TH>
                <TH className="hidden md:table-cell">Category</TH>
                <TH className="hidden text-right sm:table-cell">Cost</TH>
                <TH className="text-right">Price</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {data.data.map((p) => (
                <TR key={p.id} onOpen={() => setDetailsOf(p)}>
                  <TD>
                    <input
                      type="checkbox"
                      className="h-5 w-5 sm:h-4 sm:w-4"
                      aria-label={`Select ${p.name}`}
                      checked={selected.has(p.id)}
                      onChange={() => toggleSelected(p.id)}
                    />
                  </TD>
                  <TD>
                    <div className="flex items-center gap-3">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          loading="lazy"
                          decoding="async"
                          className="hidden h-9 w-9 shrink-0 rounded-md border border-border object-cover sm:block"
                        />
                      ) : (
                        <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground sm:flex">
                          <Package className="h-4 w-4" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{p.name}</span>
                          {p.isRxRequired && <RxBadge />}
                          <ExpiryBadge
                            product={p}
                            onHand={storeId && p.onHandQty != null ? Number(p.onHandQty) : undefined}
                          />
                        </div>
                        <div className="flex gap-1 pt-1">
                          {p.trackBatches && <Badge tone="warning">Batch</Badge>}
                          {p.trackSerials && <Badge tone="warning">Serial</Badge>}
                          {!!p._count?.variants && (
                            <Badge tone="primary">{p._count.variants} variants</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </TD>
                  <TD className="hidden text-muted-foreground md:table-cell">{p.sku || '—'}</TD>
                  <TD className="hidden md:table-cell">
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
                  <TD className="hidden text-right sm:table-cell">{formatMoney(p.costPrice)}</TD>
                  <TD className="text-right font-medium">{formatMoney(p.sellingPrice)}</TD>
                  <TD>
                    {/* Stacked on phones, so the row fits without scrolling sideways. */}
                    <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end">
                      <Tooltip content="Edit">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(p)} aria-label={`Edit ${p.name}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Tooltip>
                      {canDelete && (
                        <Tooltip content="Remove">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setRemoveTarget(p)}
                            aria-label={`Remove ${p.name}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </Tooltip>
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
            onPage={(p) => {
              setPage(p);
              setSelected(new Set());
            }}
          />
        </>
      )}

      {detailsOf && (
        <ProductDetailsDialog
          productId={detailsOf.id}
          storeId={storeId || undefined}
          onClose={() => setDetailsOf(null)}
          actions={
            <Button
              type="button"
              onClick={() => {
                const p = detailsOf;
                setDetailsOf(null);
                openEdit(p);
              }}
            >
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          }
        />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  decoding="async"
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Unit">
              <Select value={form.unit} onChange={(e) => set('unit', e.target.value)}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Expiry date">
              <Input
                type="date"
                value={form.expiryDate}
                onChange={(e) => set('expiryDate', e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
          {/* One card per option, in a grid: in a wrapping row they fell into
              ragged lines, and nothing said what each one changes. */}
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Product options</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <OptionToggle
                label="Taxable"
                hint="Charges the selected tax at the till"
                checked={form.isTaxable}
                onChange={(v) => set('isTaxable', v)}
              />
              <OptionToggle
                label="Prescription required (Rx)"
                hint="The till asks for a prescription reference"
                checked={form.isRxRequired}
                onChange={(v) => set('isRxRequired', v)}
              />
              <OptionToggle
                label="Track batches / expiry"
                hint="Each delivery keeps its own batch and expiry date"
                checked={form.trackBatches}
                onChange={(v) => set('trackBatches', v)}
              />
              <OptionToggle
                label="Track serial / IMEI numbers"
                hint="One serial per unit, entered when received and sold"
                checked={form.trackSerials}
                onChange={(v) => set('trackSerials', v)}
              />
            </div>
          </fieldset>
          {/* Switching batches on keeps the date of what is already on the
              shelf: it becomes a batch with the product's current expiry. */}
          {editing && !editing.trackBatches && form.trackBatches && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Stock already on hand becomes a batch
              {editing.expiryDate ? ` expiring ${formatDate(editing.expiryDate)}` : ' with no expiry date'}, at each
              store. New deliveries then keep their own dates.
            </p>
          )}

          <StoreAvailability productId={editing?.id ?? null} />

          <VariantsSection productId={editing?.id ?? null} canDelete={canDelete} />

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

      <ImportDialog
        open={importing}
        onClose={() => setImporting(false)}
        title="Import products"
        intro="Add new products or update existing ones from a spreadsheet. Tip: Export first, edit that file in Excel, and import it back — only what you change is updated."
        columns={PRODUCT_IMPORT_HELP}
        onTemplate={() => void exportCsv('product-import-template', PRODUCT_COLUMNS, PRODUCT_TEMPLATE).catch((e) => show(apiError(e), 'error'))}
        check={async (rows) => {
          const r = await ProductsApi.importProducts(rows, true);
          return {
            counts: [{ label: 'New products', value: r.created }, { label: 'Updated', value: r.updated }],
            toImport: r.created + r.updated,
            errors: r.errors,
          };
        }}
        run={async (rows) => {
          const r = await ProductsApi.importProducts(rows);
          qc.invalidateQueries({ queryKey: ['products'] });
          qc.invalidateQueries({ queryKey: ['stock'] });
          qc.invalidateQueries({ queryKey: ['categories'] });
          return { message: `Imported: ${r.created} new, ${r.updated} updated.`, errors: r.errors };
        }}
      />

      <ConfirmDialog
        open={!!removeTarget}
        title="Remove product"
        description={removeTarget ? `Remove "${removeTarget.name}" from your catalog?` : undefined}
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() => {
          if (removeTarget) remove.mutate(removeTarget.id);
        }}
        onCancel={() => setRemoveTarget(null)}
      />
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
  id,
}: {
  categories: Category[];
  selected: string[];
  onToggle: (id: string) => void;
  /** Injected by the enclosing Field so its <label for> points at the search box. */
  id?: string;
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
          id={id}
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

/**
 * One product option as a card: the checkbox, what it is, and in a line what
 * it does. The whole card is the label, so it is one large tap target.
 */
function OptionToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50',
        checked ? 'border-primary/60 bg-primary/5' : 'border-border',
      )}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-tight">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}
