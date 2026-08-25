import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';

interface CrudResourceApi<T, TCreate, TUpdate> {
  create: (body: TCreate) => Promise<T>;
  update: (id: string, body: TUpdate) => Promise<T>;
  remove: (id: string) => Promise<unknown>;
}

interface UseCrudResourceOptions<T, TCreate, TUpdate> {
  /** Invalidated after a successful save or remove. */
  queryKey: readonly unknown[];
  api: CrudResourceApi<T, TCreate, TUpdate>;
  messages?: {
    created?: string;
    updated?: string;
    removed?: string;
  };
}

/**
 * Shared create/edit/delete plumbing for a simple CRUD screen: the
 * open/editing/removeTarget dialog state, and the save + remove mutations
 * (invalidate → toast → close on success, toast on error). The list query
 * and the form/table markup stay screen-specific since those differ per
 * resource.
 */
export function useCrudResource<T extends { id: string }, TCreate = object, TUpdate = TCreate>({
  queryKey,
  api,
  messages,
}: UseCrudResourceOptions<T, TCreate, TUpdate>) {
  const qc = useQueryClient();
  const { show } = useToast();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [removeTarget, setRemoveTarget] = useState<T | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const save = useMutation({
    mutationFn: (body: TCreate | TUpdate) =>
      editing ? api.update(editing.id, body as TUpdate) : api.create(body as TCreate),
    onSuccess: () => {
      invalidate();
      show(editing ? (messages?.updated ?? 'Updated') : (messages?.created ?? 'Created'));
      setOpen(false);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.remove(id),
    onSuccess: () => {
      invalidate();
      show(messages?.removed ?? 'Removed');
      setRemoveTarget(null);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const openCreate = () => {
    setEditing(null);
    setOpen(true);
  };
  const openEdit = (item: T) => {
    setEditing(item);
    setOpen(true);
  };
  const close = () => setOpen(false);

  return {
    open,
    editing,
    openCreate,
    openEdit,
    close,
    save,
    removeTarget,
    setRemoveTarget,
    remove,
  };
}
