'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ScrollText } from 'lucide-react';
import { AuditApi } from '@/api';
import type { AuditEntry } from '@/types';
import { PageHeader, LoadingBlock, EmptyState } from '@/components/ui/misc';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';
import { Pagination } from '@/components/ui/pagination';

// Colour the action badge by intent.
function actionTone(action: string): 'default' | 'success' | 'warning' | 'destructive' | 'muted' {
  if (action.endsWith('.delete')) return 'destructive';
  if (action.endsWith('.create')) return 'success';
  if (action.includes('login')) return 'muted';
  if (action.endsWith('.update')) return 'warning';
  return 'default';
}

export default function ActivityLogPage() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
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
          placeholder="Filter by action (e.g. sale, product.delete)…"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {isLoading ? (
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
                <TR key={e.id}>
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
    </div>
  );
}
