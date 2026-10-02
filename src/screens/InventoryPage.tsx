'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Boxes, AlertTriangle, CalendarClock, History, ArrowLeftRight, ClipboardCheck, Fingerprint, PackagePlus, Upload } from 'lucide-react';
import { InventoryApi } from '@/api';
import type { StockItem } from '@/types';
import { useActiveStores } from '@/hooks/useStores';
import { useStoreScope } from '@/store/StoreContext';
import { PageHeader, LoadingBlock, EmptyState, ErrorState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { AdjustStockDialog } from '@/components/inventory/AdjustStockDialog';
import { ExpiringTab } from '@/components/inventory/ExpiringTab';
import { MovementsTab } from '@/components/inventory/MovementsTab';
import { ReorderLevelDialog } from '@/components/inventory/ReorderLevelDialog';
import { ReorderTab } from '@/components/inventory/ReorderTab';
import { SerialsTab } from '@/components/inventory/SerialsTab';
import { StockImportDialog } from '@/components/inventory/StockImportDialog';
import { StockTable } from '@/components/inventory/StockTable';
import { StockTakeTab } from '@/components/inventory/StockTakeTab';
import { TransferDialog } from '@/components/inventory/TransferDialog';
import { liveRefetchInterval } from '@/lib/live';
import { Tabs } from '@/components/ui/tabs';

const TABS = ['stock', 'low', 'reorder', 'expiring', 'movements', 'stockTake', 'serials'] as const;
type Tab = (typeof TABS)[number];
const isTab = (v: string | null): v is Tab => (TABS as readonly string[]).includes(v ?? '');

const TAB_LIST: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'stock', label: 'Stock levels', icon: Boxes },
  { key: 'low', label: 'Low stock', icon: AlertTriangle },
  { key: 'reorder', label: 'Reorder', icon: PackagePlus },
  { key: 'expiring', label: 'Expiring', icon: CalendarClock },
  { key: 'movements', label: 'History', icon: History },
  { key: 'stockTake', label: 'Stock take', icon: ClipboardCheck },
  { key: 'serials', label: 'Serials', icon: Fingerprint },
];

/**
 * Stock: levels and alerts, history, stock takes and the serial register,
 * one tab each (in components/inventory), plus import and transfer.
 */
export default function InventoryPage() {
  const { data: stores } = useActiveStores();
  const multiStore = (stores?.length ?? 0) > 1;
  // The tab lives in the URL (?tab=expiring), so the dashboard tiles, the
  // Analytics shortcuts and the bell's alerts open the right one -- even when
  // this page is already showing -- and a reload stays put.
  const router = useRouter();
  const tabParam = useSearchParams().get('tab');
  const tab: Tab = isTab(tabParam) ? tabParam : 'stock';
  const setTab = (t: Tab) => router.replace(t === 'stock' ? '/inventory' : `/inventory?tab=${t}`, { scroll: false });

  const [adjusting, setAdjusting] = useState<StockItem | null>(null);
  const [reorderTarget, setReorderTarget] = useState<StockItem | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [importingStock, setImportingStock] = useState(false);

  // Every list on this page follows the branch chosen in the header. The
  // server scopes pinned staff on its own; this is what lets an owner review
  // one branch at a time.
  const { storeId } = useStoreScope();
  const forStore = storeId || undefined;
  // Only when a row could be from any of several branches: with a store
  // selected every row is that store's, and one store is no ambiguity at all.
  const showStoreColumn = !storeId && multiStore;

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Stock levels, alerts, and movement history."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setImportingStock(true)}>
              <Upload className="h-4 w-4" /> Import stock
            </Button>
            {multiStore && (
              <Button variant="outline" onClick={() => setTransferOpen(true)}>
                <ArrowLeftRight className="h-4 w-4" /> Transfer stock
              </Button>
            )}
          </div>
        }
      />

      <Tabs
        className="mb-5"
        label="Stock views"
        items={TAB_LIST.map((t) => ({ id: t.key, label: t.label, icon: t.icon }))}
        value={tab}
        onChange={setTab}
      />

      {/* Keyed on the branch: switching it starts each list from page one. */}
      {tab === 'stock' && (
        <StockLevels key={storeId} storeId={forStore} showStoreColumn={showStoreColumn}
          onAdjust={setAdjusting} onReorderLevel={setReorderTarget} />
      )}
      {tab === 'low' && (
        <LowStock storeId={forStore} showStoreColumn={showStoreColumn}
          onAdjust={setAdjusting} onReorderLevel={setReorderTarget} />
      )}
      {tab === 'reorder' && <ReorderTab stores={stores} />}
      {tab === 'expiring' && <Expiring storeId={forStore} showStoreColumn={showStoreColumn} />}
      {tab === 'movements' && <MovementsTab key={storeId} storeId={forStore} showStoreColumn={showStoreColumn} />}
      {tab === 'stockTake' && <StockTakeTab stores={stores} />}
      {tab === 'serials' && <SerialsTab key={storeId} storeId={forStore} />}

      {/* Mounted per opening, so each starts blank. */}
      {adjusting && (
        <AdjustStockDialog key={adjusting.id} item={adjusting} multiStore={multiStore} onClose={() => setAdjusting(null)} />
      )}
      {reorderTarget && (
        <ReorderLevelDialog key={reorderTarget.id} item={reorderTarget} onClose={() => setReorderTarget(null)} />
      )}
      {transferOpen && <TransferDialog stores={stores} onClose={() => setTransferOpen(false)} />}
      {importingStock && (
        <StockImportDialog storeId={storeId} multiStore={multiStore} onClose={() => setImportingStock(false)} />
      )}
    </div>
  );
}

type RowActions = {
  storeId: string | undefined;
  showStoreColumn: boolean;
  onAdjust: (i: StockItem) => void;
  onReorderLevel: (i: StockItem) => void;
};

function StockLevels({ storeId, showStoreColumn, onAdjust, onReorderLevel }: RowActions) {
  const [page, setPage] = useState(1);
  const stock = useQuery({
    queryKey: ['stock', page, storeId ?? ''],
    queryFn: () => InventoryApi.stock({ page, limit: 20, storeId }),
    refetchInterval: liveRefetchInterval,
  });
  if (stock.isError) return <ErrorState onRetry={() => stock.refetch()} />;
  if (stock.isLoading) return <LoadingBlock />;
  if (!stock.data || stock.data.data.length === 0) {
    return <EmptyState title="No stock records" description="Stock appears once you receive purchases or adjust manually." icon={Boxes} />;
  }
  return (
    <>
      <StockTable items={stock.data.data} onAdjust={onAdjust} onReorderLevel={onReorderLevel} showStore={showStoreColumn} />
      <Pagination page={stock.data.meta.page} pages={stock.data.meta.pages} onPage={setPage} />
    </>
  );
}

function LowStock({ storeId, showStoreColumn, onAdjust, onReorderLevel }: RowActions) {
  const low = useQuery({
    queryKey: ['low-stock', storeId ?? ''],
    queryFn: () => InventoryApi.lowStock(storeId),
    refetchInterval: liveRefetchInterval,
  });
  if (low.isError) return <ErrorState onRetry={() => low.refetch()} />;
  if (low.isLoading) return <LoadingBlock />;
  if (!low.data || low.data.length === 0) {
    return <EmptyState title="All good!" description="No items are below their reorder level." icon={AlertTriangle} />;
  }
  return <StockTable items={low.data} onAdjust={onAdjust} onReorderLevel={onReorderLevel} lowMode showStore={showStoreColumn} />;
}

function Expiring({ storeId, showStoreColumn }: { storeId: string | undefined; showStoreColumn: boolean }) {
  const expiring = useQuery({
    queryKey: ['expiring', storeId ?? ''],
    queryFn: () => InventoryApi.expiring({ days: 30, storeId }),
    refetchInterval: liveRefetchInterval,
  });
  if (expiring.isError) return <ErrorState onRetry={() => expiring.refetch()} />;
  if (expiring.isLoading) return <LoadingBlock />;
  if (!expiring.data || expiring.data.length === 0) {
    return <EmptyState title="Nothing expiring soon" description="No stock expires within 30 days." icon={CalendarClock} />;
  }
  return <ExpiringTab rows={expiring.data} showStore={showStoreColumn} />;
}
