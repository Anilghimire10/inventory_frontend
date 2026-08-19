'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Tags, Package } from 'lucide-react';
import { CategoriesApi, ProductsApi } from '@/api';
import type { Category } from '@/types';
import { PageHeader, LoadingBlock, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useAuth } from '@/auth/AuthContext';
import { can } from '@/lib/permissions';

export default function CategoriesPage() {
  const qc = useQueryClient();
  const { show } = useToast();
  const { user } = useAuth();
  const canDelete = !!user && can.deleteCatalog(user.role);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  // The category whose products we're currently viewing.
  const [viewing, setViewing] = useState<Category | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Category | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => CategoriesApi.list(),
  });

  const save = useMutation({
    mutationFn: () =>
      editing
        ? CategoriesApi.update(editing.id, { name })
        : CategoriesApi.create({ name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      show(editing ? 'Category updated' : 'Category created');
      setOpen(false);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => CategoriesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      show('Category deleted');
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Organize your products into groups."
        action={
          <Button onClick={() => { setEditing(null); setName(''); setOpen(true); }}>
            <Plus className="h-4 w-4" /> Add category
          </Button>
        }
      />

      {isLoading ? (
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
                      onClick={() => { setEditing(c); setName(c.name); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {canDelete && (
                      <Button size="icon" variant="ghost" aria-label={`Delete ${c.name}`}
                        onClick={() => setRemoveTarget(c)}>
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

      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? 'Edit category' : 'New category'}>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>{editing ? 'Save' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!removeTarget}
        title="Delete category"
        description={removeTarget ? `Delete "${removeTarget.name}" and its grouping?` : undefined}
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => {
          if (removeTarget) remove.mutate(removeTarget.id);
        }}
        onCancel={() => setRemoveTarget(null)}
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
  const { data, isLoading } = useQuery({
    queryKey: ['products', 'by-category', category.id],
    queryFn: () => ProductsApi.list({ categoryId: category.id, limit: 100 }),
  });
  const products = data?.data ?? [];

  return (
    <Dialog open onClose={onClose} title={`Products in “${category.name}”`}>
      {isLoading ? (
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