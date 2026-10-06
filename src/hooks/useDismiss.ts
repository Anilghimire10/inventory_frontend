import { useEffect, useRef } from 'react';

/**
 * Closes a header pop-over (the bell, the account menu) on a tap outside it,
 * Escape, or tabbing out. Put the returned ref on the element that holds both
 * the trigger and the pop-over.
 *
 * Not the trigger's blur: Safari (every iPhone) never focuses a tapped button,
 * so there blur never fires and the pop-over couldn't be closed by tapping
 * away; elsewhere a tap on plain text inside it closed it.
 */
export function useDismiss<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open, close]);
  return ref;
}
