'use client';
import { useEffect } from 'react';
import { clearToken, getToken, setToken } from '@/lib/api';
import { LoadingBlock } from '@/components/ui/misc';

/**
 * Where the admin panel's "View as owner" lands, in a new tab. The session
 * token arrives in the #fragment -- never sent to any server, so it stays out
 * of access logs -- and is taken off the address bar and history before
 * anything else happens, so it can't be copied from there or bookmarked.
 *
 * sessionStorage is per tab, so this never touches a real session the admin
 * or the owner has open in another tab.
 */
export default function ImpersonatePage() {
  useEffect(() => {
    const token = new URLSearchParams(location.hash.slice(1)).get('token');
    if (token) {
      history.replaceState(null, '', location.pathname);
      clearToken();
      setToken(token);
    }
    // Idempotent on purpose: this can run twice (React re-runs effects in
    // development), and by the second run the fragment is already gone. Only
    // a token in the URL starts a session; its absence never ends one.
    // A full load, so the app starts clean with the new session.
    location.replace(token || getToken() ? '/' : '/login');
  }, []);

  return <LoadingBlock />;
}
