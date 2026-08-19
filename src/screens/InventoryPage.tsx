'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, SlidersHorizontal, AlertTriangle, CalendarClock, History } from 'lucide-react';
import { InventoryApi } from '@/api';
import type { StockItem } from '@/types';
import { useStores } from '@/hooks/useStores';
import { PageHeader, LoadingBlock, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

type Tab = 'stock' | 'low' | 'expiring' | 'movements';

export default function InventoryPage() {
  const qc = useQueryClient();
  const { show } = useToast();
  const { data: stores } = useStores();
  const [tab, setTab] = useState<Tab>('stock');
  const [stockPage, setStockPage] = useState(1);
  const [movementPage, setMovementPage] = useState(1);
  const [adjusting, setAdjusting] = useState<StockItem | null>(null);
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState('COUNT_CORRECTION');
  const [note, setNote] = useState('');

  const stock = useQuery({
    queryKey: ['stock', stockPage],
    queryFn: () => InventoryApi.stock({ page: stockPage, limit: 20 }),
    enabled: tab === 'stock',
  });
  const low = useQuery({
    queryKey: ['low-stock'],
    queryFn: () => InventoryApi.lowStock(),
    enabled: tab === 'low',
  });
  const expiring = useQuery({
    queryKey: ['expiring'],
    queryFn: () => InventoryApi.expiring({ days: 30 }),
    enabled: tab === 'expiring',
  });
  const movements = useQuery({
    queryKey: ['movements', movementPage],
    queryFn: () => InventoryApi.movements({ page: movementPage, limit: 20 }),
    enabled: tab === 'movements',
  });

  const adjust = useMutation({
    mutationFn: () =>
      InventoryApi.adjust({
        storeId: adjusting!.storeId,
        productId: adjusting!.productId,
        delta,
        reason,
        note: note || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['low-stock'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      show('Stock adjusted');
      setAdjusting(null);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const openAdjust = (item: StockItem) => {
    setAdjusting(item);
    setDelta(0);
    setReason('COUNT_CORRECTION');
    setNote('');
  };

  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'stock', label: 'Stock levels', icon: Boxes },
    { key: 'low', label: 'Low stock', icon: AlertTriangle },
    { key: 'expiring', label: 'Expiring', icon: CalendarClock },
    { key: 'movements', label: 'History', icon: History },
  ];

  return (
    <div>
      <PageHeader title="Inventory" description="Stock levels, alerts, and movement history." />

      <div className="mb-5 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'stock' && (
        stock.isLoading ? <LoadingBlock /> :
        !stock.data || stock.data.data.length === 0 ? (
          <EmptyState title="No stock records" description="Stock appears once you receive purchases or adjust manually." icon={Boxes} />
        ) : (
          <>
            <StockTable items={stock.data.data} onAdjust={openAdjust} />
            <Pagination page={stock.data.meta.page} pages={stock.data.meta.pages} onPage={setStockPage} />
          </>
        )
      )}

      {tab === 'low' && (
        low.isLoading ? <LoadingBlock /> :
        !low.data || low.data.length === 0 ? (
          <EmptyState title="All good!" description="No items are below their reorder level." icon={AlertTriangle} />
        ) : (
          <StockTable items={low.data} onAdjust={openAdjust} lowMode />
        )
      )}

      {tab === 'expiring' && (
        expiring.isLoading ? <LoadingBlock /> :
        !expiring.data || expiring.data.length === 0 ? (
          <EmptyState title="Nothing expiring soon" description="No batches expire within 30 days." icon={CalendarClock} />
        ) : (
          <Table>
            <THead><TR><TH>Product</TH><TH>Batch</TH><TH>Expires</TH><TH className="text-right">Qty</TH></TR></THead>
            <TBody>
              {expiring.data.map((b) => (
                <TR key={b.id}>
                  <TD className="font-medium">{b.product.name}</TD>
                  <TD className="text-muted-foreground">{b.batchNumber || '—'}</TD>
                  <TD><Badge tone="destructive">{formatDate(b.expiryDate)}</Badge></TD>
                  <TD className="text-right">{b.quantity}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )
      )}

      {tab === 'movements' && (
        movements.isLoading ? <LoadingBlock /> :
        !movements.data || movements.data.data.length === 0 ? (
          <EmptyState title="No movements yet" description="Every stock change will be logged here." icon={History} />
        ) : (
          <>
            <Table>
              <THead><TR><TH>When</TH><TH>Product</TH><TH>Type</TH><TH className="text-right">Change</TH><TH>By</TH></TR></THead>
              <TBody>
                {movements.data.data.map((m) => (
                  <TR key={m.id}>
                    <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(m.createdAt)}</TD>
                    <TD className="font-medium">{m.product.name}</TD>
                    <TD><Badge tone="muted">{m.type}</Badge></TD>
                    <TD className={cn('text-right font-medium', m.quantity >= 0 ? 'text-success' : 'text-destructive')}>
                      {m.quantity >= 0 ? '+' : ''}{m.quantity}
                    </TD>
                    <TD className="text-muted-foreground">{m.user?.name ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={movements.data.meta.page} pages={movements.data.meta.pages} onPage={setMovementPage} />
          </>
        )
      )}

      <Dialog open={!!adjusting} onClose={() => setAdjusting(null)} title="Adjust stock"
        description={adjusting?.product.name}>
        <form onSubmit={(e) => { e.preventDefault(); adjust.mutate(); }} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Current quantity: <span className="font-medium text-foreground">{adjusting?.quantity}</span>
            {stores && stores.length > 1 && adjusting?.store && <> · {adjusting.store.name}</>}
          </p>
          <Field label="Change (use negative to remove)">
            <Input type="number" value={delta} onChange={(e) => setDelta(Number(e.target.value))} autoFocus />
          </Field>
          <Field label="Reason">
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="COUNT_CORRECTION">Count correction</option>
              <option value="DAMAGE">Damage</option>
              <option value="THEFT">Theft / loss</option>
              <option value="EXPIRED">Expired</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>
          <Field label="Note (optional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAdjusting(null)}>Cancel</Button>
            <Button type="submit" loading={adjust.isPending} disabled={delta === 0}>Apply</Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}

function StockTable({
  items,
  onAdjust,
  lowMode,
}: {
  items: StockItem[];
  onAdjust: (i: StockItem) => void;
  lowMode?: boolean;
}) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Product</TH>
          <TH>SKU</TH>
          <TH className="text-right">Qty</TH>
          <TH className="text-right">Reorder at</TH>
          <TH></TH>
        </TR>
      </THead>
      <TBody>
        {items.map((it) => {
          const reorder =
            it.effectiveReorderLevel ?? (it.reorderLevel || it.product.reorderLevel || 0);
          const lowFlag = reorder > 0 && it.quantity <= reorder;
          return (
            <TR key={it.id}>
              <TD className="font-medium">{it.product.name}</TD>
              <TD className="text-muted-foreground">{it.product.sku || '—'}</TD>
              <TD className="text-right">
                <span className={cn('font-semibold', (lowMode || lowFlag) && 'text-warning')}>
                  {it.quantity}
                </span>
              </TD>
              <TD className="text-right text-muted-foreground">{reorder || '—'}</TD>
              <TD className="text-right">
                <Button size="sm" variant="outline" onClick={() => onAdjust(it)}>
                  <SlidersHorizontal className="h-3.5 w-3.5" /> Adjust
                </Button>
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}