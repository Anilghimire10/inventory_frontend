'use client';
import { useEffect } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { clientId } from '@/lib/client-id';
import { openLiveStream, type LiveTopic } from '@/lib/live-events';
import { setLiveConnected } from '@/lib/live';

/**
 * What each kind of change makes stale. Never the stock take's count sheet:
 * reloading it re-seeds the counts and would wipe what's being typed.
 */
const STALE: Record<LiveTopic, QueryKey[]> = {
  sales: [['sales'], ['sale'], ['dashboard'], ['held-sales'], ['analytics'], ['tax-report'], ['credit'], ['shift-current']],
  stock: [['stock'], ['low-stock'], ['expiring'], ['movements'], ['serials'], ['reorder-suggestions'], ['products'], ['product'], ['dashboard']],
  catalog: [['products'], ['product'], ['variants'], ['categories'], ['taxes']],
  customers: [['customers'], ['credit'], ['dashboard']],
  // A purchase moves cost prices and input VAT too.
  purchases: [['purchases'], ['suppliers'], ['reorder-suggestions'], ['credit'], ['tax-report'], ['analytics'], ['dashboard']],
  shifts: [['shift-current'], ['shift-open'], ['shift-history'], ['shift-float']],
  notifications: [['notifications']],
  subscription: [['subscription']],
  support: [['support']],
  settings: [['stores'], ['users'], ['business-setup']],
};

const ALL = Object.keys(STALE) as LiveTopic[];

/** Leave the stream open this long after the tab is hidden: a quick switch away and back keeps it. */
const HIDDEN_GRACE_MS = 60_000;

function reload(
  qc: ReturnType<typeof useQueryClient>,
  topics: LiveTopic[],
  refetchType: 'active' | 'none' = 'active',
) {
  const keys = new Map<string, QueryKey>();
  for (const t of topics) for (const k of STALE[t] ?? []) keys.set(JSON.stringify(k), k);
  // Only screens on show refetch now; the rest are marked stale for when they open.
  for (const queryKey of keys.values()) void qc.invalidateQueries({ queryKey, refetchType });
}

/**
 * Keeps the signed-in app in step with the other tills and the admin panel:
 * listens on the live stream and reloads what each change touches, the
 * moment it happens. Renders nothing.
 *
 * While the tab is hidden the stream is closed (after a minute's grace), so a
 * shop with many idle tabs doesn't hold a connection each; on return it
 * reconnects and reloads everything once, catching up on what it missed.
 */
export function LiveUpdates() {
  const qc = useQueryClient();

  useEffect(() => {
    const me = clientId();
    let close: (() => void) | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let everConnected = false;
    let connectedNow = false;

    const start = () => {
      if (close) return;
      close = openLiveStream({
        onChange: ({ topics, origin }) => {
          // This tab made the change, and the screen that made it has
          // refreshed itself -- but not every other screen the change
          // touches. Skipping the event entirely left them cached as fresh
          // (staleTime 30s): ring up a sale, open Sales, and it wasn't there
          // until a reload. So mark them stale for when they open, without
          // refetching what's on show a second time.
          if (origin && origin === me) {
            reload(qc, topics, 'none');
            return;
          }
          reload(qc, topics);
        },
        onStatus: (connected) => {
          // Only changes count: a server that's down reports "not connected"
          // on every retry, and that mustn't reload every screen each time.
          if (connected === connectedNow) return;
          connectedNow = connected;
          setLiveConnected(connected);
          // Back after a gap (reconnect, tab shown again): anything could have
          // changed meanwhile. Just dropped: reload too, which puts the
          // screens back on 30-second polling (liveRefetchInterval).
          if (!connected || everConnected) reload(qc, ALL);
          if (connected) everConnected = true;
        },
      });
    };
    const stop = () => {
      close?.();
      close = null;
      connectedNow = false;
      setLiveConnected(false);
    };

    const onVisibility = () => {
      clearTimeout(hideTimer);
      if (document.visibilityState === 'hidden') hideTimer = setTimeout(stop, HIDDEN_GRACE_MS);
      else start();
    };

    if (document.visibilityState !== 'hidden') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(hideTimer);
      stop();
    };
  }, [qc]);

  return null;
}
