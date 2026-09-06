import type { ProductVariant } from '@/types';

/**
 * TEMPORARY: product variants have no backend yet (see Tasks.md #15). This
 * mocks persistence in localStorage so the UI can be built and demoed now.
 *
 * The function shapes mirror what a real `VariantsApi` (axios, async) would
 * look like — swapping this module for one that calls `/products/:id/variants`
 * should not require changing any component that uses it.
 */

const STORAGE_KEY = 'inv_mock_variants_v1';

function readAll(): ProductVariant[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProductVariant[]) : [];
  } catch {
    return [];
  }
}

function writeAll(rows: ProductVariant[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

// Simulated network latency so loading states in the UI aren't instant/untested.
const delay = <T,>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 150));

export type VariantInput = {
  attributes: ProductVariant['attributes'];
  sku?: string;
  barcode?: string;
  price: number;
  costPrice: number;
  stock: number;
};

export const VariantsMockApi = {
  listByProduct: (productId: string) => delay(readAll().filter((v) => v.productId === productId)),

  listAll: () => delay(readAll()),

  create: (productId: string, body: VariantInput) => {
    const now = new Date().toISOString();
    const row: ProductVariant = {
      id: crypto.randomUUID(),
      productId,
      createdAt: now,
      updatedAt: now,
      ...body,
    };
    const rows = readAll();
    rows.push(row);
    writeAll(rows);
    return delay(row);
  },

  update: (id: string, body: VariantInput) => {
    const rows = readAll();
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error('Variant not found');
    rows[idx] = { ...rows[idx], ...body, updatedAt: new Date().toISOString() };
    writeAll(rows);
    return delay(rows[idx]);
  },

  remove: (id: string) => {
    writeAll(readAll().filter((r) => r.id !== id));
    return delay({ message: 'Variant removed' });
  },

  /** Called when the parent product itself is deleted, so mock data doesn't orphan. */
  removeAllForProduct: (productId: string) => {
    writeAll(readAll().filter((r) => r.productId !== productId));
  },
};
