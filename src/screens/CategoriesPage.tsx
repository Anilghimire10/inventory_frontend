'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Tags, Package } from 'lucide-react';
import { CategoriesApi, ProductsApi } from '@/api';
import type { Category } from '@/types';
import { ProductDetailsDialog } from '@/components/products/ProductDetailsDialog';
import { useStoreScope, ALL_STORES } from '@/store/StoreContext';
import { useStoreLabel } from '@/components/StorePicker';
import { useStores } from '@/hooks/useStores';
import { cn } from '@/lib/utils';
import { useCrudResource } from '@/hooks/useCrudResource';
import { PageHeader, LoadingBlock, EmptyState, ErrorState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
import { formatMoney } from '@/lib/format';
import { useAuth } from '@/auth/AuthContext';
import { can } from '@/lib/permissions';

export default function CategoriesPage() {
  const { user } = useAuth();
  const canDelete = !!user && can.deleteCatalog(user.role);
  const [name, setName] = useState('');
  // The category whose products we're currently viewing.
  const [viewing, setViewing] = useState<Category | null>(null);
  // A product opened from that category's list; Back returns to the list.
  const [viewingProduct, setViewingProduct] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['categories'],
    queryFn: () => CategoriesApi.list(),
  });

  const crud = useCrudResource<Category>({
    queryKey: ['categories'],
    api: CategoriesApi,
    messages: { created: 'Category created', updated: 'Category updated', removed: 'Category deleted' },
  });

  const openCreate = () => { setName(''); crud.openCreate(); };
  const openEdit = (c: Category) => { setName(c.name); crud.openEdit(c); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    crud.save.mutate({ name });
  };

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Organize your products into groups."
        action={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add category
          </Button>
        }
      />

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : !data || data.length === 0 ? (
        <EmptyState title="No categories" description="Group products to keep your catalog tidy." icon={Tags} />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH className="text-right">Products</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {data.map((c) => (
              <TR key={c.id} onOpen={() => setViewing(c)}>
                <TD className="font-medium">{c.name}</TD>
                <TD className="text-right text-muted-foreground">{c._count?.products ?? 0}</TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    <Tooltip content="View products">
                      <Button size="icon" variant="ghost" onClick={() => setViewing(c)} aria-label={`View products in ${c.name}`}>
                        <Package className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                    <Tooltip content="Edit">
                      <Button size="icon" variant="ghost" aria-label={`Edit ${c.name}`}
                        onClick={() => openEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                    {canDelete && (
                      <Tooltip content="Delete">
                        <Button size="icon" variant="ghost" aria-label={`Delete ${c.name}`}
                          onClick={() => crud.setRemoveTarget(c)}>
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
      )}

      <Dialog open={crud.open} onClose={crud.close} title={crud.editing ? 'Edit category' : 'New category'}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={crud.close}>Cancel</Button>
            <Button type="submit" loading={crud.save.isPending}>{crud.editing ? 'Save' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!crud.removeTarget}
        title="Delete category"
        description={crud.removeTarget ? `Delete "${crud.removeTarget.name}" and its grouping?` : undefined}
        confirmLabel="Delete"
        loading={crud.remove.isPending}
        onConfirm={() => {
          if (crud.removeTarget) crud.remove.mutate(crud.removeTarget.id);
        }}
        onCancel={() => crud.setRemoveTarget(null)}
      />

      {viewing && !viewingProduct && (
        <CategoryProductsDialog
          category={viewing}
          onOpenProduct={setViewingProduct}
          onClose={() => setViewing(null)}
        />
      )}
      {viewingProduct && (
        <ProductDetailsDialog
          productId={viewingProduct}
          onBack={() => setViewingProduct(null)}
          onClose={() => {
            setViewingProduct(null);
            setViewing(null);
          }}
        />
      )}
    </div>
  );
}

/** How many of a category's products the dialog lists at once. */
const LIST_LIMIT = 100;

/**
 * A category at a glance: how many products, what they sell for, and -- with
 * a branch chosen in the header -- what is on the shelf there and what it
 * cost. Each product opens its own details.
 */
function CategoryProductsDialog({
  category,
  onOpenProduct,
  onClose,
}: {
  category: Category;
  onOpenProduct: (id: string) => void;
  onClose: () => void;
}) {
  const { storeId } = useStoreScope();
  const storeLabel = useStoreLabel(storeId);
  // On-hand is per store, and the API only carries it when asked about one:
  // the branch chosen in the header, or the only store there is -- which is
  // most shops, and never has a branch to choose.
  const { data: stores } = useStores();
  const stockAt = storeId !== ALL_STORES ? storeId : stores?.length === 1 ? stores[0].id : undefined;
  const perStore = !!stockAt;
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['products', 'by-category', category.id, stockAt ?? ''],
    queryFn: () => ProductsApi.list({ categoryId: category.id, limit: LIST_LIMIT, storeId: stockAt }),
  });
  const products = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const units = products.reduce((sum, p) => sum + Number(p.onHandQty ?? 0), 0);
  const value = products.reduce((sum, p) => sum + Number(p.onHandQty ?? 0) * Number(p.costPrice), 0);
  const prices = products.map((p) => Number(p.sellingPrice));

  return (
    <Dialog open onClose={onClose} title={category.name} className="max-w-2xl">
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : products.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No products in this category yet.
        </p>
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-md border border-border p-4 text-sm sm:grid-cols-4">
            <Stat label="Products" value={String(total)} />
            <Stat
              label="Price range"
              value={
                Math.min(...prices) === Math.max(...prices)
                  ? formatMoney(prices[0])
                  : `${formatMoney(Math.min(...prices))} – ${formatMoney(Math.max(...prices))}`
              }
            />
            {perStore && <Stat label={`On hand${storeLabel ? ` · ${storeLabel}` : ''}`} value={String(units)} />}
            {perStore && <Stat label="Stock value (cost)" value={formatMoney(value)} />}
          </dl>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH className="hidden sm:table-cell">SKU</TH>
                {perStore && <TH className="text-right">On hand</TH>}
                <TH className="text-right">Price</TH>
              </TR>
            </THead>
            <TBody>
              {products.map((p) => {
                const qty = Number(p.onHandQty ?? 0);
                const low = !!p.effectiveReorderLevel && qty <= p.effectiveReorderLevel;
                return (
                  <TR key={p.id} onOpen={() => onOpenProduct(p.id)}>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            loading="lazy"
                            decoding="async"
                            className="h-8 w-8 shrink-0 rounded-md border border-border object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                            <Package className="h-3.5 w-3.5" />
                          </div>
                        )}
                        <span className="font-medium">{p.name}</span>
                      </div>
                    </TD>
                    <TD className="hidden text-muted-foreground sm:table-cell">{p.sku || '—'}</TD>
                    {perStore && (
                      <TD className={cn('text-right', low && 'font-semibold text-warning')}>{p.onHandQty ?? '0'}</TD>
                    )}
                    <TD className="text-right font-medium">{formatMoney(p.sellingPrice)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          {total > products.length && (
            <p className="text-xs text-muted-foreground">
              Showing the first {products.length} of {total}; the totals above cover these.
            </p>
          )}
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-semibold">{value}</dd>
    </div>
  );
}
