/**
 * Tells a barcode scanner from a person typing.
 *
 * A scanner is a keyboard to the browser: it "types" the whole code into
 * whatever has focus, a character every few milliseconds, then presses Enter
 * (or Tab). Nobody types six or more characters at that pace, so a burst
 * that fast, ended by Enter, is a scan -- wherever the cursor happens to be.
 */

/** The longest gap between two characters of one scan. People are 80ms+ apart. */
export const SCAN_GAP_MS = 40;
/** The shortest code taken as a scan: shorter bursts are left as typing. */
export const SCAN_MIN_LENGTH = 6;

export function createScanBurst(gapMs = SCAN_GAP_MS, minLength = SCAN_MIN_LENGTH) {
  let chars = '';
  let last = Number.NEGATIVE_INFINITY;
  const reset = () => {
    chars = '';
    last = Number.NEGATIVE_INFINITY;
  };
  return {
    /**
     * A printable character typed at `at` (ms). Returns how many characters
     * the burst holds now -- 1 when this one starts a new one.
     */
    char(ch: string, at: number) {
      if (at - last > gapMs) chars = '';
      chars += ch;
      last = at;
      return chars.length;
    },
    /** Enter or Tab at `at`: the scanned code, or null when it was a person. */
    end(at: number) {
      const code = chars.length >= minLength && at - last <= gapMs * 2 ? chars : null;
      reset();
      return code;
    },
    reset,
  };
}

/**
 * Put a field back to what it held before a scan typed into it. Through the
 * native setter and an input event, so a React-controlled field's state
 * follows -- setting `.value` alone would be undone on the next render.
 */
export function restoreFieldValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
