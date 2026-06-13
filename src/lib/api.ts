import axios, { AxiosError } from 'axios';

const TOKEN_KEY = 'inv_token';

export const getToken = () =>
  typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export const api = axios.create({
  // /api is proxied to the backend by next.config.mjs rewrites.
  baseURL: '/api',
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
      if (!location.pathname.startsWith('/login')) location.href = '/login';
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
