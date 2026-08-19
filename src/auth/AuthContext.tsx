'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import { AuthApi } from '@/api';
import { clearToken, setToken, getToken } from '@/lib/api';
import { setCurrency } from '@/lib/format';
import type { SessionUser } from '@/types';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (body: {
    businessName: string;
    businessType?: string;
    email: string;
    name: string;
    password: string;
  }) => Promise<{ message: string; email: string }>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState>(null as never);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    const me = await AuthApi.me();
    const session: SessionUser = {
      id: me.id,
      email: me.email,
      name: me.name,
      role: me.role,
      storeId: me.storeId,
      business: me.business,
    };
    if (me.business?.currency) setCurrency(me.business.currency);
    setUser(session);
  }, []);

  useEffect(() => {
    (async () => {
      if (getToken()) {
        try {
          await loadMe();
        } catch {
          clearToken();
        }
      }
      setLoading(false);
    })();
  }, [loadMe]);

  const login = async (email: string, password: string) => {
    const res = await AuthApi.login(email, password);
    setToken(res.accessToken);
    await loadMe();
  };

  // Registration no longer logs in: the user must verify their email first.
  const register: AuthState['register'] = async (body) => {
    return AuthApi.register(body);
  };

  const verifyEmail: AuthState['verifyEmail'] = async (email, code) => {
    const res = await AuthApi.verifyEmail(email, code);
    setToken(res.accessToken);
    await loadMe();
  };

  const logout = () => {
    clearToken();
    setUser(null);
    // Full-page redirect resets the app to a clean login state.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    location.href = '/login';
  };

  return (
    <Ctx.Provider
      value={{ user, loading, login, register, verifyEmail, logout, refresh: loadMe }}
    >
      {children}
    </Ctx.Provider>
  );
}
