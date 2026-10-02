import { API_BASE, getToken } from './api';
import { clientId } from './client-id';

/** What the server says changed (inventory_backend/src/realtime). */
export type LiveTopic =
  | 'sales'
  | 'stock'
  | 'catalog'
  | 'customers'
  | 'purchases'
  | 'shifts'
  | 'notifications'
  | 'subscription'
  | 'support'
  | 'settings';

export interface LiveChange {
  topics: LiveTopic[];
  /** The tab that made the change, or null for the server's own (an announcement). */
  origin: string | null;
}

/**
 * Hold the live stream open: `GET /api/events`, read as server-sent events.
 * fetch rather than EventSource, because EventSource can't send the
 * Authorization header and the token must not go in the URL (it would land
 * in proxy and server logs).
 *
 * Reconnects by itself -- the server ends each stream after half an hour, and
 * networks drop -- waiting 2s, 4s, ... up to a minute between tries. A 401
 * stops it: the session is over and the app's own sign-out takes it from
 * there. Returns a function that closes it for good.
 */
export function openLiveStream(handlers: {
  onChange: (change: LiveChange) => void;
  onStatus: (connected: boolean) => void;
}): () => void {
  let stopped = false;
  let controller: AbortController | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let delay = 2_000;

  const connect = async () => {
    const token = getToken();
    if (stopped || !token) return;
    controller = new AbortController();
    try {
      const res = await fetch(`${API_BASE}/events`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream', 'X-Client-Id': clientId() },
        signal: controller.signal,
        cache: 'no-store',
      });
      if (res.status === 401 || res.status === 403) {
        handlers.onStatus(false);
        return;
      }
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      handlers.onStatus(true);
      delay = 2_000;

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        // Events end with a blank line; keep any partial one for the next chunk.
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? '';
        for (const raw of events) {
          const fields: Record<string, string> = {};
          for (const line of raw.split(/\r?\n/)) {
            const i = line.indexOf(':');
            if (i > 0) fields[line.slice(0, i)] = line.slice(i + 1).trimStart();
          }
          if (fields.event !== 'change' || !fields.data) continue;
          try {
            handlers.onChange(JSON.parse(fields.data) as LiveChange);
          } catch {
            // A malformed event is skipped; the next one still counts.
          }
        }
      }
    } catch {
      // Aborted, or the network dropped: either way, retry below unless stopped.
    }
    handlers.onStatus(false);
    if (stopped) return;
    retry = setTimeout(connect, delay);
    delay = Math.min(delay * 2, 60_000);
  };

  void connect();
  return () => {
    stopped = true;
    clearTimeout(retry);
    controller?.abort();
  };
}
