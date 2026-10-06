'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { AuthApi } from '@/api';
import axios from 'axios';
import { clearToken, setToken, getToken, getCachedSession, setCachedSession } from '@/lib/api';
import { setCurrency } from '@/lib/format';
import type { SessionUser } from '@/types';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  /**
   * There is a saved session, but the server couldn't be asked about it --
   * offline, waking up, or down for maintenance. Not the same as signed out.
   */
  unreachable: boolean;
  /** Ask again after `unreachable`. */
  retry: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (body: {
    businessName: string;
    businessType?: string;
    salesModel?: string;
    currency?: string;
    email: string;
    name: string;
    password: string;
  }) => Promise<{ message: string; email: string }>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState>(null as never);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);

  const loadMe = useCallback(async () => {
    const me = await AuthApi.me();
    const session: SessionUser = {
      id: me.id,
      email: me.email,
      name: me.name ?? me.email,
      role: me.role,
      storeId: me.storeId,
      business: me.business,
      subscription: me.subscription,
      impersonation: me.impersonation ?? null,
    };
    if (me.business?.currency) setCurrency(me.business.currency);
    setCachedSession(session);
    setUser(session);
  }, []);

  // Only a 401 means the session is over, and the response interceptor has
  // already dropped the token and moved on for that. Anything else -- no
  // connection, the server waking up, maintenance (which refuses /auth/me
  // too) -- used to clear the token as well, so everyone who reloaded during
  // a blip had to sign in again afterwards.
  const restore = useCallback(async () => {
    if (getToken()) {
      // Draw the app from the last known session now, and confirm it with the
      // API behind it: the shell and the page's own requests no longer queue
      // up behind /auth/me. The server still checks every request, so a stale
      // copy can show a menu item at worst, never data.
      const cached = getCachedSession();
      if (cached) {
        if (cached.business?.currency) setCurrency(cached.business.currency);
        setUser(cached);
        setLoading(false);
      }
      try {
        await loadMe();
        setUnreachable(false);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          clearToken();
          setUser(null);
        } else setUnreachable(true);
      }
    }
    setLoading(false);
  }, [loadMe]);

  useEffect(() => {
    (async () => {
      await restore();
    })();
  }, [restore]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await AuthApi.login(email, password);
      setToken(res.accessToken);
      await loadMe();
    },
    [loadMe],
  );

  // Registration no longer logs in: the user must verify their email first.
  const register: AuthState['register'] = useCallback(async (body) => {
    return AuthApi.register(body);
  }, []);

  const verifyEmail: AuthState['verifyEmail'] = useCallback(
    async (email, code) => {
      const res = await AuthApi.verifyEmail(email, code);
      setToken(res.accessToken);
      await loadMe();
    },
    [loadMe],
  );

  const logout = useCallback(async () => {
    // Tell the server first — it writes the `auth.logout` audit row, which
    // mirrors `auth.login`, and the request needs the token still in place.
    // A failure here (offline, expired token) must not trap the user in the
    // app, so the sign-out continues either way.
    try {
      await AuthApi.logout();
    } catch {
      // Nothing to surface: the local sign-out below is what the user asked for.
    }
    clearToken();
    setUser(null);
    // Full-page redirect resets the app to a clean login state.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    location.href = '/login';
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      unreachable,
      retry: restore,
      login,
      register,
      verifyEmail,
      logout,
      refresh: loadMe,
    }),
    [user, loading, unreachable, restore, login, register, verifyEmail, logout, loadMe],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
