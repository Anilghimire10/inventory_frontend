'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { InventoryApi } from '@/api';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/pagination';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Stock → History: every stock change, newest first. */
export function MovementsTab({
  storeId,
  showStoreColumn,
  onOpenProduct,
}: {
  storeId: string | undefined;
  showStoreColumn: boolean;
  /** A row click: that product's details at that row's store. */
  onOpenProduct?: (productId: string, storeId?: string) => void;
}) {
  const [movementPage, setMovementPage] = useState(1);
  const movements = useQuery({
    queryKey: ['movements', movementPage, storeId ?? ''],
    queryFn: () => InventoryApi.movements({ page: movementPage, limit: 20, storeId }),
  });

  return (
    movements.isError ? <ErrorState onRetry={() => movements.refetch()} /> :
  movements.isLoading ? <LoadingBlock /> :
  !movements.data || movements.data.data.length === 0 ? (
    <EmptyState title="No movements yet" description="Every stock change will be logged here." icon={History} />
  ) : (
    <>
      <Table>
        <THead><TR><TH>When</TH><TH>Product</TH>{showStoreColumn && <TH>Store</TH>}<TH>Type</TH><TH className="text-right">Change</TH><TH>By</TH></TR></THead>
        <TBody>
          {movements.data.data.map((m) => {
            // Decimal(12,3) string: coerce for the sign test, but print
            // the value as the server wrote it.
            const change = Number(m.quantity);
            return (
              <TR key={m.id} onOpen={onOpenProduct && (() => onOpenProduct(m.product.id, m.store?.id ?? storeId))}>
                <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(m.createdAt)}</TD>
                <TD className="font-medium">{m.product.name}</TD>
                {showStoreColumn && (
                  <TD className="text-muted-foreground">{m.store?.name ?? '—'}</TD>
                )}
                <TD><Badge tone="muted">{m.type}</Badge></TD>
                <TD className={cn('text-right font-medium', change >= 0 ? 'text-success' : 'text-destructive')}>
                  {change >= 0 ? '+' : ''}{m.quantity}
                </TD>
                <TD className="text-muted-foreground">{m.user?.name ?? '—'}</TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      <Pagination page={movements.data.meta.page} pages={movements.data.meta.pages} onPage={setMovementPage} />
    </>
  )
  );
}
