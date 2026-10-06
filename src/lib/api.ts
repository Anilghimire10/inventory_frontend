import axios, { AxiosError } from 'axios';
import type { SupportContact } from '@/types';
import { clientId } from './client-id';
import { tabStorage } from './tab-storage';

const TOKEN_KEY = 'inv_token';

// Scoped to one tab in a browser: localStorage is shared by every tab of the
// same origin, so an owner and a staff member signed in from two tabs on the
// same machine would overwrite each other's token and both end up as whoever
// logged in last on refresh. Kept across restarts in the Android app, which
// has no tabs (see tabStorage).
export const getToken = () =>
  typeof window === 'undefined' ? null : tabStorage().getItem(TOKEN_KEY);
export const setToken = (t: string) => tabStorage().setItem(TOKEN_KEY, t);
export const clearToken = () => tabStorage().removeItem(TOKEN_KEY);

// On web (dev/prod server) `/api` is proxied to the backend by next.config.mjs
// rewrites. In the mobile (Capacitor static export) build there is no proxy, so
// NEXT_PUBLIC_API_URL must point at the absolute backend base, e.g.
// https://api.yourdomain.com/api
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

export const api = axios.create({ baseURL: API_BASE });

// Attach the JWT to every request.
api.interceptors.request.use((config) => {
  const token = getToken();
  // A request that brings its own (the lock screen's billing-only pass)
  // keeps it.
  if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`;
  // Names this tab on the live update its change causes (see LiveUpdates).
  config.headers['X-Client-Id'] = clientId();
  return config;
});

/**
 * What the API sends when a subscription locks the shop out (a 401 with
 * `code: 'SUBSCRIPTION_INACTIVE'`): enough for the expired screen to say when
 * it ended and who to contact.
 */
export interface SubscriptionBlock {
  reason: 'expired' | 'inactive';
  endedAt: string | null;
  contact: SupportContact;
  /**
   * For an owner or manager: a short-lived pass (about an hour) that opens
   * only the Subscription routes, so the lock screen can show how to pay and
   * take an "I've paid" report.
   */
  billingToken?: string;
}

const BLOCK_KEY = 'inv_subscription_block';

export function subscriptionBlock(err: unknown): SubscriptionBlock | null {
  if (!axios.isAxiosError(err) || err.response?.status !== 401) return null;
  const data = err.response.data as (Partial<SubscriptionBlock> & { code?: string }) | undefined;
  if (data?.code !== 'SUBSCRIPTION_INACTIVE') return null;
  return {
    reason: data.reason === 'expired' ? 'expired' : 'inactive',
    endedAt: data.endedAt ?? null,
    contact: data.contact ?? {},
    ...(typeof data.billingToken === 'string' ? { billingToken: data.billingToken } : {}),
  };
}

/** Hand the block to the expired screen, which may be a full page load away. */
export function rememberBlock(block: SubscriptionBlock) {
  try {
    sessionStorage.setItem(BLOCK_KEY, JSON.stringify(block));
  } catch {
    // Storage unavailable: the screen falls back to its generic wording.
  }
}

/**
 * The stored block as its raw string: a stable snapshot for
 * `useSyncExternalStore`, which re-renders forever if handed a freshly parsed
 * object on every call. Parse it with `parseBlock`.
 */
export function blockSnapshot(): string | null {
  try {
    return sessionStorage.getItem(BLOCK_KEY);
  } catch {
    return null;
  }
}

export function parseBlock(raw: string | null): SubscriptionBlock | null {
  try {
    return raw ? (JSON.parse(raw) as SubscriptionBlock) : null;
  } catch {
    return null;
  }
}

/** Fired when the API answers 503 MAINTENANCE; MaintenanceBanner listens. */
export const MAINTENANCE_EVENT = 'inv:maintenance';

// On 401, drop the token and bounce to login -- or, when the subscription is
// what stopped it, to the screen that says so. Sending a shop whose
// subscription lapsed back to a login form it can't get past explains
// nothing.
api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    // Closed for maintenance: keep the session, and have the maintenance
    // screen look now rather than at its next check.
    if (error.response?.status === 503 && apiErrorCode(error) === 'MAINTENANCE') {
      window.dispatchEvent(new Event(MAINTENANCE_EVENT));
    }
    if (error.response?.status === 401 && getToken()) {
      clearToken();
      const block = subscriptionBlock(error);
      if (block) {
        rememberBlock(block);
        if (!location.pathname.startsWith('/subscription-expired')) {
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          location.href = '/subscription-expired';
        }
      } else if (!location.pathname.startsWith('/login')) {
        // Full-page redirect from an axios interceptor (no router in scope).
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

/** The machine-readable `code` an API error carries, e.g. `TILL_OPEN`. */
export function apiErrorCode(err: unknown): string | undefined {
  if (!axios.isAxiosError(err)) return undefined;
  return (err.response?.data as { code?: string } | undefined)?.code;
}

/** Pull a human-readable message out of an Axios error. */
export function apiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    if (data?.message) {
      return Array.isArray(data.message) ? data.message.join(', ') : data.message;
    }
    return err.message;
  }
  return 'Something went wrong';
}
