'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Tags, Package } from 'lucide-react';
import { CategoriesApi, ProductsApi } from '@/api';
import type { Category } from '@/types';
import { useCrudResource } from '@/hooks/useCrudResource';
import { PageHeader, LoadingBlock, EmptyState, ErrorState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { formatMoney } from '@/lib/format';
import { useAuth } from '@/auth/AuthContext';
import { can } from '@/lib/permissions';

export default function CategoriesPage() {
  const { user } = useAuth();
  const canDelete = !!user && can.deleteCatalog(user.role);
  const [name, setName] = useState('');
  // The category whose products we're currently viewing.
  const [viewing, setViewing] = useState<Category | null>(null);

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
              <TR key={c.id}>
                <TD>
                  <button
                    onClick={() => setViewing(c)}
                    className="font-medium text-primary hover:underline"
                  >
                    {c.name}
                  </button>
                </TD>
                <TD className="text-right text-muted-foreground">{c._count?.products ?? 0}</TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setViewing(c)}
                      title="View products" aria-label={`View products in ${c.name}`}>
                      <Package className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label={`Edit ${c.name}`}
                      onClick={() => openEdit(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {canDelete && (
                      <Button size="icon" variant="ghost" aria-label={`Delete ${c.name}`}
                        onClick={() => crud.setRemoveTarget(c)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
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

      {viewing && (
        <CategoryProductsDialog
          category={viewing}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

/** Lists the products that belong to a given category. */
function CategoryProductsDialog({
  category,
  onClose,
}: {
  category: Category;
  onClose: () => void;
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['products', 'by-category', category.id],
    queryFn: () => ProductsApi.list({ categoryId: category.id, limit: 100 }),
  });
  const products = data?.data ?? [];

  return (
    <Dialog open onClose={onClose} title={`Products in “${category.name}”`}>
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : products.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No products in this category yet.
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>SKU</TH>
              <TH className="text-right">Price</TH>
            </TR>
          </THead>
          <TBody>
            {products.map((p) => (
              <TR key={p.id}>
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
                <TD className="text-muted-foreground">{p.sku || '—'}</TD>
                <TD className="text-right font-medium">{formatMoney(p.sellingPrice)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}