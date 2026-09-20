import axios, { AxiosError } from 'axios';

const TOKEN_KEY = 'inv_token';

// sessionStorage, not localStorage: the token must stay scoped to one tab.
// localStorage is shared by every tab of the same origin, so an owner and a
// staff member signed in from two tabs on the same machine would overwrite
// each other's token and both end up as whoever logged in last on refresh.
export const getToken = () =>
  typeof window === 'undefined' ? null : sessionStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => sessionStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => sessionStorage.removeItem(TOKEN_KEY);

export const api = axios.create({
  // On web (dev/prod server) `/api` is proxied to the backend by next.config.mjs
  // rewrites. In the mobile (Capacitor static export) build there is no proxy, so
  // NEXT_PUBLIC_API_URL must point at the absolute backend base, e.g.
  // https://api.yourdomain.com/api
  baseURL: process.env.NEXT_PUBLIC_API_URL || '/api',
});

// Attach the JWT to every request.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, drop the token and bounce to login.
api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401 && getToken()) {
      clearToken();
      if (!location.pathname.startsWith('/login')) {
        // Full-page redirect from an axios interceptor (no router in scope).
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

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
