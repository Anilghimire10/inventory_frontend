import { useEffect, useRef, type RefObject } from 'react';

/**
 * Traps Tab focus inside `panelRef`'s element while `active`, moves initial
 * focus into it on open, and restores focus to whatever had it before on
 * close. Locks page scroll for the same duration.
 *
 * Pass `onEscape` to let Escape dismiss the panel -- omit it for a modal that
 * must block until a choice is made (e.g. opening a till, choosing a store),
 * where Escape should do nothing.
 */
export function useFocusTrap(
  panelRef: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape?: () => void,
) {
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!active) return;
    const panel = panelRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEscapeRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled'));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    const previouslyFocused = document.activeElement;
    const focusables = panel?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]):not([aria-label="Close"]):not([aria-label="Cancel"]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    );
    focusables?.[0]?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [active, panelRef]);
}
