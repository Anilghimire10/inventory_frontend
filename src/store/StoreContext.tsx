'use client';
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { useStores } from '@/hooks/useStores';
import { tabStorage } from '@/lib/tab-storage';

/** Value meaning "don't filter" — what the report endpoints expect for all stores. */
export const ALL_STORES = '';

const KEY = 'inv_store';

/**
 * The chosen branch lives outside React: it is read from sessionStorage, which
 * does not exist while the page is prerendered. useSyncExternalStore is the
 * supported way to read that without a hydration mismatch, and without writing
 * state from an effect.
 *
 * sessionStorage, not localStorage: it must stay scoped to one tab. Two tabs
 * on the same machine can be signed in as different users (e.g. an owner and
 * a staff member), and localStorage is shared by every tab of the same
 * origin — one tab's branch switch would leak into the other's session. The
 * Android app keeps it across restarts instead, like the token (tabStorage).
 */
let cached: string | null = null;
const listeners = new Set<() => void>();

function readStored(): string {
  if (cached !== null) return cached;
  try {
    cached = tabStorage().getItem(KEY) ?? ALL_STORES;
  } catch {
    // Private window or blocked storage — all stores is a fine default.
    cached = ALL_STORES;
  }
  return cached;
}

function writeStored(id: string) {
  cached = id;
  try {
    if (id) tabStorage().setItem(KEY, id);
    else tabStorage().removeItem(KEY);
  } catch {
    // The selection still applies for this session.
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

interface StoreState {
  /** The branch the whole app is looking at, or ALL_STORES. */
  storeId: string;
  setStoreId: (id: string) => void;
  /** Whether this user may look at more than one branch at all. */
  canSwitch: boolean;
}

const Ctx = createContext<StoreState>({
  storeId: ALL_STORES,
  setStoreId: () => {},
  canSwitch: false,
});

/** The branch the app is currently showing. */
export const useStoreScope = () => useContext(Ctx);

/**
 * One store selection shared by every screen.
 *
 * Each screen used to hold its own `useState(ALL_STORES)`, so switching branch
 * on the dashboard left analytics, products and sales showing something else.
 * Owners and managers move between branches, and when they do the whole app
 * should follow.
 *
 * Cashiers and stock keepers with a store assigned are pinned to it: the API
 * confines them there anyway (StoreScopeGuard), so there is nothing to choose.
 */
export function StoreScopeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { data: stores } = useStores();

  const pinned =
    !!user && user.role !== 'OWNER' && user.role !== 'MANAGER' && !!user.storeId
      ? user.storeId
      : null;

  const chosen = useSyncExternalStore(subscribe, readStored, () => ALL_STORES);

  const setStoreId = useCallback((id: string) => writeStored(id), []);

  const value = useMemo<StoreState>(() => {
    // A remembered branch that has since been deleted would filter everything
    // to nothing with no obvious way back, so it is ignored rather than
    // written over — the next pick replaces it anyway.
    const stale = !!chosen && !!stores && !stores.some((s) => s.id === chosen);
    return {
      storeId: pinned ?? (stale ? ALL_STORES : chosen),
      setStoreId,
      canSwitch: !pinned && (stores?.length ?? 0) > 1,
    };
  }, [pinned, chosen, stores, setStoreId]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
