'use client';
import { ArrowUpDown, FileText, Package, Printer, Wallet } from 'lucide-react';
import type { OpenShiftSummary, ShiftReport } from '@/types';
import type { PosStoreResolution } from '@/lib/posStore';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Tooltip } from '@/components/ui/tooltip';
import { formatMoney } from '@/lib/format';

/**
 * The till's top row: which store it sells from, and the drawer's actions
 * while a shift is open -- cash in/out, the X report, close -- plus the last
 * receipt and the shortcuts list. With more than one till open here, an
 * owner or manager picks which drawer the next sale goes into.
 */
export function PosHeader({
  multiStore,
  storesLoaded,
  storeName,
  lockedBy,
  shift,
  tills,
  onSwitchTill,
  isReporting,
  onCashMove,
  onXReport,
  onCloseShift,
  canPrintLast,
  onPrintLast,
  onHelp,
}: {
  multiStore: boolean;
  storesLoaded: boolean;
  storeName: string | null;
  /** Why the store can't be changed here, if it can't. */
  lockedBy: PosStoreResolution['lockedBy'];
  shift: ShiftReport | null;
  /** Every till open at this store; only management gets any. */
  tills: OpenShiftSummary[];
  onSwitchTill: (id: string) => void;
  isReporting: boolean;
  onCashMove: () => void;
  onXReport: () => void;
  onCloseShift: () => void;
  canPrintLast: boolean;
  onPrintLast: () => void;
  onHelp: () => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <h1 className="text-xl font-semibold tracking-tight">Point of Sale</h1>

      {/* Which store this till sells from. Only worth showing when there is
          more than one -- a single-store shop has nothing to disambiguate.
          Always a label, never a control: the store is chosen when the shift
          is opened (the open-shift modal covers the till, so a control here
          is unreachable), and an open shift pins it. */}
      {multiStore && storesLoaded && (
        <span
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground"
          title={
            lockedBy === 'shift'
              ? 'This till is running against the shift open at this store'
              : lockedBy === 'role'
                ? 'You are assigned to this store'
                : 'Stock and the sale both follow this store'
          }
        >
          <Package className="h-3.5 w-3.5" />
          {storeName ?? 'No store'}
        </span>
      )}

      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {shift && tills.length > 1 && (
          <Select
            aria-label="Till"
            title="Which drawer the next sale goes into. The others stay open."
            className="h-8 w-auto min-w-40"
            value={shift.id}
            onChange={(e) => onSwitchTill(e.target.value)}
          >
            {/* The till on screen may have just closed and fallen out of the
                list; keep it selectable until the refresh lands. */}
            {!tills.some((t) => t.id === shift.id) && <option value={shift.id}>This till</option>}
            {tills.map((t) => (
              <option key={t.id} value={t.id}>
                {t.isOwnShift ? 'My till' : `${t.openedBy.name}’s till`} · {t.salesCount} sale{t.salesCount === 1 ? '' : 's'}
              </option>
            ))}
          </Select>
        )}
        {shift && shift.isOwnShift === false && tills.length <= 1 && (
          <span
            className="flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning"
            title="You are selling into a drawer someone else opened. Its cash, and its variance at close, are theirs."
          >
            <Wallet className="h-3.5 w-3.5" />
            {shift.user?.name ?? 'Another user'}&apos;s till
          </span>
        )}
        {shift && (
          <>
            <Tooltip content="Pay in or pay out: cash into or out of the drawer that isn't a sale">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCashMove()}
              >
                <ArrowUpDown className="h-4 w-4" /> Cash in/out
              </Button>
            </Tooltip>
            <Tooltip content="Print an X report — mid-shift drawer reading, shift stays open">
              <Button
                variant="outline"
                size="sm"
                loading={isReporting}
                onClick={onXReport}
              >
                <FileText className="h-4 w-4" /> X report
              </Button>
            </Tooltip>
            <Tooltip content="Close shift and print a Z report">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCloseShift()}
              >
                <Wallet className="h-4 w-4" /> {formatMoney(shift.gross)} · Close shift
              </Button>
            </Tooltip>
          </>
        )}
        {canPrintLast && (
          <Tooltip content="Print the last sale's receipt">
            <Button variant="outline" size="sm" onClick={onPrintLast}>
              <Printer className="h-4 w-4" /> Last receipt
            </Button>
          </Tooltip>
        )}
        <Tooltip content="Keyboard shortcuts">
          <Button variant="outline" size="sm" onClick={() => onHelp()} aria-label="Keyboard shortcuts">
            ?
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
