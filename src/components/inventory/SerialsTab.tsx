'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Fingerprint } from 'lucide-react';
import { InventoryApi, ProductsApi } from '@/api';
import type { Product, SerialStatus } from '@/types';
import { SearchPicker } from '@/components/SearchPicker';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/pagination';
import { Select } from '@/components/ui/select';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';

const SERIAL_STATUS_LABEL: Record<SerialStatus, string> = {
  IN_STOCK: 'In stock',
  SOLD: 'Sold',
  RETURNED_TO_SUPPLIER: 'Returned',
  DAMAGED: 'Damaged',
  LOST: 'Lost',
};

/** Stock → Serials: the serial/IMEI register, searchable and filterable. */
export function SerialsTab({
  storeId,
  onOpenProduct,
}: {
  storeId: string | undefined;
  /** A row click: that product's details at that row's store. */
  onOpenProduct?: (productId: string, storeId?: string) => void;
}) {
  const [serialsPage, setSerialsPage] = useState(1);
  const [serialSearch, setSerialSearch] = useState('');
  const [serialStatus, setSerialStatus] = useState<SerialStatus | ''>('');
  const [serialProduct, setSerialProduct] = useState<{ id: string; label: string } | null>(null);
  const serialProductId = serialProduct?.id ?? '';

  const serials = useQuery({
    queryKey: ['serials', serialsPage, serialSearch, serialStatus, serialProductId, storeId ?? ''],
    queryFn: () =>
      InventoryApi.serials({
        page: serialsPage,
        limit: 20,
        storeId,
        search: serialSearch || undefined,
        status: serialStatus || undefined,
        productId: serialProductId || undefined,
      }),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-2">
        <Input
          className="max-w-xs"
          placeholder="Search by serial number…"
          value={serialSearch}
          onChange={(e) => { setSerialSearch(e.target.value); setSerialsPage(1); }}
        />
        <SearchPicker<Product>
          className="w-full max-w-xs"
          queryKey={['products', 'pick', 'serialised']}
          fetchPage={(search, limit) =>
            ProductsApi.list({ search: search || undefined, limit, trackSerials: true, activeOnly: false })
          }
          label={(p) => p.name}
          detail={(p) => p.sku}
          selected={serialProduct}
          noneLabel="All products"
          onPick={(p) => { setSerialProduct(p ? { id: p.id, label: p.name } : null); setSerialsPage(1); }}
          placeholder="Search serialised products…"
          aria-label="Filter by product"
        />
        <Select
          className="max-w-xs"
          value={serialStatus}
          onChange={(e) => { setSerialStatus(e.target.value as SerialStatus | ''); setSerialsPage(1); }}
        >
          <option value="">All statuses</option>
          <option value="IN_STOCK">In stock</option>
          <option value="SOLD">Sold</option>
          <option value="RETURNED_TO_SUPPLIER">Returned to supplier</option>
          <option value="DAMAGED">Damaged</option>
          <option value="LOST">Lost</option>
        </Select>
      </div>

      {serials.isError ? <ErrorState onRetry={() => serials.refetch()} /> :
      serials.isLoading ? <LoadingBlock /> :
      !serials.data || serials.data.data.length === 0 ? (
        <EmptyState title="No serials found" description="Units tracked by serial/IMEI will show up here once received." icon={Fingerprint} />
      ) : (
        <>
          <Table>
            <THead><TR><TH>Serial #</TH><TH>Product</TH><TH>Status</TH><TH>Store</TH><TH>Sold to</TH><TH>Updated</TH></TR></THead>
            <TBody>
              {serials.data.data.map((s) => (
                <TR key={s.id} onOpen={onOpenProduct && (() => onOpenProduct(s.product.id, s.store?.id))}>
                  <TD className="font-medium">{s.serialNumber}</TD>
                  <TD>{s.product.name}</TD>
                  <TD>
                    <Badge tone={s.status === 'IN_STOCK' ? 'success' : s.status === 'SOLD' ? 'muted' : 'destructive'}>
                      {SERIAL_STATUS_LABEL[s.status]}
                    </Badge>
                  </TD>
                  <TD className="text-muted-foreground">{s.store?.name ?? '—'}</TD>
                  <TD className="text-muted-foreground">
                    {s.sale ? `${s.sale.customer?.name ?? 'Walk-in'} · ${s.sale.receiptNo}` : '—'}
                  </TD>
                  <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(s.updatedAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={serials.data.meta.page} pages={serials.data.meta.pages} onPage={setSerialsPage} />
        </>
      )}
    </div>
  );
}
