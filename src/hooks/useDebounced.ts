import { useEffect, useState } from 'react';

/**
 * `value`, but held back until it has stopped changing for `delay` ms.
 *
 * Not the same job as `useDeferredValue`, which is what the POS search used to
 * use. `useDeferredValue` de-prioritises the *render* of the new value: React
 * keeps the old UI interactive and re-renders with the new one when it has a
 * spare moment. It does not skip any values -- every settled keystroke still
 * reaches the render, and so still reaches the query key and the network. On a
 * till on a 3G connection that is one request per character typed, each one
 * cancelling the last one's usefulness.
 *
 * Debouncing skips values instead: only the one the user stopped on is ever
 * returned, so "shampoo" is one request rather than seven. Use this for
 * anything that reaches the network; `useDeferredValue` remains the right tool
 * for keeping an expensive *local* render off the typing path.
 *
 * 250ms is about the gap between keystrokes of an unhurried typist -- long
 * enough to swallow a burst, short enough that the grid still feels like it is
 * keeping up.
 */
export function useDebounced<T>(value: T, delay = 250): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delay);
    // Cleared on every change, so the timer only ever fires once the value has
    // been still for the whole delay.
    return () => clearTimeout(t);
  }, [value, delay]);

  return settled;
}
