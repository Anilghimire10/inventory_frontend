'use client';
import { useQueryClient } from '@tanstack/react-query';
import { InventoryApi } from '@/api';
import { ImportDialog } from '@/components/ImportDialog';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { exportCsv } from '@/lib/csv';

const STOCK_COLUMNS = [
  { key: 'sku', label: 'SKU' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'name', label: 'Name' },
  { key: 'store', label: 'Store' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'cost', label: 'Cost price' },
  { key: 'batch', label: 'Batch' },
  { key: 'expiry', label: 'Expiry date' },
  { key: 'serials', label: 'Serials' },
];

const STOCK_TEMPLATE = [
  { sku: 'RICE-1KG', barcode: '', name: 'Basmati rice 1kg', store: '', quantity: 40, cost: 180, batch: 'B-2409', expiry: '2027-06-30', serials: '' },
  { sku: 'SAM-A15', barcode: '', name: 'Samsung Galaxy A15', store: '', quantity: 2, cost: 21000, batch: '', expiry: '', serials: '354900112233441|354900112233442' },
];

const STOCK_IMPORT_HELP = [
  { name: 'SKU, Barcode or Name', required: true, note: 'which product; the first one filled in is used, and Name must match exactly' },
  { name: 'Quantity', required: true, note: 'how many to add to what is already there' },
  { name: 'Store', note: 'branch name; blank uses the branch picked at the top of the app' },
  { name: 'Cost price', note: 'what each unit cost; fills in the product’s cost if it has none' },
  { name: 'Batch, Expiry date', note: 'for batch-tracked products (expiry like 2027-06-30); for other products, Expiry date sets the product’s expiry' },
  { name: 'Serials', note: 'for serial-tracked products: one per unit, separated by |' },
];

/** Opening stock from a spreadsheet: checked first, then added. */
export function StockImportDialog({
  storeId,
  multiStore,
  onClose,
}: {
  /** The branch picked in the header; '' for all. */
  storeId: string;
  multiStore: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { show } = useToast();
  return (
    <ImportDialog
      open
      onClose={onClose}
      title="Import stock"
      intro={
        'Add the stock you already have — for example on your first day — from a spreadsheet. Each row adds a quantity of one product at one branch. ' +
        (storeId
          ? 'Rows with no Store go to the branch picked at the top of the app.'
          : multiStore
            ? 'You have more than one branch: fill in the Store column, or pick a branch at the top of the app first.'
            : '')
      }
      columns={STOCK_IMPORT_HELP}
      onTemplate={() => void exportCsv('stock-import-template', STOCK_COLUMNS, STOCK_TEMPLATE).catch((e) => show(apiError(e), 'error'))}
      check={async (rows) => {
        const r = await InventoryApi.importStock(rows, { storeId: storeId || undefined, dryRun: true });
        return {
          counts: [{ label: 'Rows to add', value: r.rows ?? 0 }, { label: 'Units in total', value: r.units }],
          toImport: r.rows ?? 0,
          errors: r.errors,
        };
      }}
      run={async (rows) => {
        const r = await InventoryApi.importStock(rows, { storeId: storeId || undefined });
        qc.invalidateQueries({ queryKey: ['stock'] });
        qc.invalidateQueries({ queryKey: ['movements'] });
        qc.invalidateQueries({ queryKey: ['serials'] });
        qc.invalidateQueries({ queryKey: ['expiring'] });
        qc.invalidateQueries({ queryKey: ['products'] });
        return { message: `Added ${r.imported ?? 0} rows — ${r.units} units in total.`, errors: r.errors };
      }}
    />
  );
}
