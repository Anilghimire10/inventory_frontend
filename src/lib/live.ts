/**
 * How often a screen that other devices change -- the Dashboard, the till's
 * stock, the stock lists, the sales list, the bell -- asks the server again on
 * its own. Paused while the tab is hidden (React Query's default).
 *
 * With the live stream connected (see LiveUpdates), changes arrive the moment
 * they happen, so polling drops to a slow safety net. Without it -- the stream
 * blocked by a proxy, the server restarting -- it's every 30 seconds, which
 * stays far below the API's 120 requests a minute per IP even for a shop with
 * several tills behind one connection.
 */
export const LIVE_REFRESH_MS = 30_000;
const SAFETY_NET_MS = 5 * 60_000;

let streamConnected = false;

export function setLiveConnected(connected: boolean) {
  streamConnected = connected;
}

export function isLiveConnected() {
  return streamConnected;
}

/**
 * For `refetchInterval`. React Query asks again after each fetch, and the
 * stream refetches everything when it drops (LiveUpdates), so a lost stream
 * goes back to 30-second polling straight away.
 */
export const liveRefetchInterval = () => (streamConnected ? SAFETY_NET_MS : LIVE_REFRESH_MS);
