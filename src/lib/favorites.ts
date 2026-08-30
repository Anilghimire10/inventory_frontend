const KEY = 'pos:favorites';

/** Load pinned product ids for the POS quick-access grid. Defensive against malformed/foreign data in the slot. */
export function loadFavoriteIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveFavoriteIds(ids: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Storage full or unavailable (private browsing) -- pins just won't
    // survive a refresh; not worth surfacing an error for.
  }
}
