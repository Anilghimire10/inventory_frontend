'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Search, ScrollText } from 'lucide-react';
import { AuditApi } from '@/api';
import type { AuditEntry } from '@/types';
import { PageHeader, LoadingBlock, EmptyState, ErrorState } from '@/components/ui/misc';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';
import { Pagination } from '@/components/ui/pagination';
import { actionTone } from '@/lib/audit';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { ProductDetailsDialog } from '@/components/products/ProductDetailsDialog';
import { PurchaseDetailsDialog } from '@/components/purchases/PurchaseDetailsDialog';
import { SupplierDetailsDialog } from '@/components/suppliers/SupplierDetailsDialog';
import { StaffDetailsDialog } from '@/components/staff/StaffDetailsDialog';

export default function ActivityLogPage() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  // The entry whose details are open, and a record opened from it (Back returns).
  const [entry, setEntry] = useState<AuditEntry | null>(null);
  const [related, setRelated] = useState<Related | null>(null);
  const back = () => setRelated(null);
  const closeAll = () => {
    setRelated(null);
    setEntry(null);
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['audit', action, page],
    queryFn: () =>
      AuditApi.list({ action: action || undefined, page, limit: 25 }),
  });

  return (
    <div>
      <PageHeader
        title="Activity Log"
        description="A record of who did what across your business."
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          aria-label="Filter by action"
          placeholder="Filter by action (e.g. sale, product.delete)…"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Actions like sales, edits, and logins will appear here."
          icon={ScrollText}
        />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>User</TH>
                <TH>Action</TH>
                <TH>Details</TH>
              </TR>
            </THead>
            <TBody>
              {data.data.map((e: AuditEntry) => (
                <TR key={e.id} onOpen={() => setEntry(e)}>
                  <TD className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(e.createdAt)}
                  </TD>
                  <TD>
                    <div className="font-medium">{e.user?.name ?? e.userName ?? 'Unknown'}</div>
                    {e.user?.role && (
                      <div className="text-xs text-muted-foreground">{e.user.role}</div>
                    )}
                  </TD>
                  <TD>
                    <Badge tone={actionTone(e.action)}>{e.action}</Badge>
                  </TD>
                  <TD className="text-sm text-muted-foreground">
                    {e.summary || `${e.method ?? ''} ${e.path ?? ''}`.trim() || '—'}
                    {e.entityId && (
                      <span className="ml-1 font-mono text-xs opacity-70">
                        #{e.entityId.slice(0, 8)}
                      </span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={data.meta.page} pages={data.meta.pages} onPage={setPage} />
        </>
      )}

      {entry && !related && <EntryDialog entry={entry} onOpen={setRelated} onClose={() => setEntry(null)} />}
      {related?.kind === 'products' && <ProductDetailsDialog productId={related.id} onBack={back} onClose={closeAll} />}
      {related?.kind === 'purchases' && <PurchaseDetailsDialog purchaseId={related.id} onBack={back} onClose={closeAll} />}
      {related?.kind === 'suppliers' && (
        <SupplierDetailsDialog
          supplierId={related.id}
          onOpenPurchase={(id) => setRelated({ kind: 'purchases', id })}
          onBack={back}
          onClose={closeAll}
        />
      )}
      {related?.kind === 'users' && <StaffDetailsDialog userId={related.id} onBack={back} onClose={closeAll} />}
    </div>
  );
}

/** Records an entry can open, keyed by the resource the log names (the API path). */
const OPENS = {
  products: 'product',
  purchases: 'purchase',
  suppliers: 'supplier',
  users: 'staff member',
} as const;
type Related = { kind: keyof typeof OPENS; id: string };

/**
 * Everything the log recorded about one action, and a way into what it was
 * about -- the product, purchase, supplier or person -- when that still
 * exists. Creates carry no id (the record didn't exist yet), so they can't.
 */
function EntryDialog({
  entry: e,
  onOpen,
  onClose,
}: {
  entry: AuditEntry;
  onOpen: (r: Related) => void;
  onClose: () => void;
}) {
  const kind = e.entity && e.entity in OPENS ? (e.entity as keyof typeof OPENS) : null;
  const who = e.user?.name ?? e.userName ?? 'Unknown';
  return (
    <Dialog open onClose={onClose} title="Activity">
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={actionTone(e.action)}>{e.action}</Badge>
          <span className="text-muted-foreground">{formatDateTime(e.createdAt)}</span>
        </div>
        {e.summary && <p className="text-base">{e.summary}</p>}
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 rounded-md border border-border p-4">
          <dt className="text-muted-foreground">By</dt>
          <dd>
            {e.user ? (
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => onOpen({ kind: 'users', id: e.user!.id })}
              >
                {who}
              </button>
            ) : (
              <span className="font-medium">{who}</span>
            )}
            {e.user?.role && <span className="ml-2 text-xs text-muted-foreground">{e.user.role}</span>}
            {!e.user && e.userName && <span className="ml-2 text-xs text-muted-foreground">(no longer on staff)</span>}
          </dd>
          {e.entity && (
            <>
              <dt className="text-muted-foreground">On</dt>
              <dd>
                {e.entity}
                {e.entityId && <span className="ml-2 font-mono text-xs text-muted-foreground">{e.entityId}</span>}
              </dd>
            </>
          )}
          {(e.method || e.path) && (
            <>
              <dt className="text-muted-foreground">Request</dt>
              <dd className="break-all font-mono text-xs">{`${e.method ?? ''} ${e.path ?? ''}`.trim()}</dd>
            </>
          )}
          {e.ip && (
            <>
              <dt className="text-muted-foreground">IP address</dt>
              <dd className="font-mono text-xs">{e.ip}</dd>
            </>
          )}
        </dl>
      </div>
      <DialogFooter>
        {kind && e.entityId && !e.action.endsWith('.delete') && (
          <Button type="button" onClick={() => onOpen({ kind, id: e.entityId! })}>
            Open {OPENS[kind]} <ArrowRight className="h-4 w-4" />
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
