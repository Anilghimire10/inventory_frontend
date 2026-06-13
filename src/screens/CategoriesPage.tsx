'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Tags } from 'lucide-react';
import { CategoriesApi } from '@/api';
import type { Category } from '@/types';
import { PageHeader, LoadingBlock, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
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
                <TD className="font-medium">{c.name}</TD>
                <TD className="text-right text-muted-foreground">{c._count?.products ?? 0}</TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost"
                      onClick={() => { setEditing(c); setName(c.name); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {canDelete && (
                      <Button size="icon" variant="ghost"
                        onClick={() => confirm(`Delete "${c.name}"?`) && remove.mutate(c.id)}>
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
    </div>
  );
}