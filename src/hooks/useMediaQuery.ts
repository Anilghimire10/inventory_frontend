import { useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query matches, kept up to date as the window changes.
 * False before hydration, where there is no window to ask.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
