const CLIENT_KEY = 'inv_client_id';

/**
 * This tab's id, sent with every request (X-Client-Id) and echoed back on the
 * change it caused, so the tab can skip reloading what it already reloaded.
 * Per tab, like the token.
 */
export function clientId(): string {
  try {
    let id = sessionStorage.getItem(CLIENT_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}
