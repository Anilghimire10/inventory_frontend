'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

type Side = 'top' | 'bottom';

/** Long enough that sweeping the mouse across a toolbar doesn't flash a row of tips. */
const OPEN_DELAY = 300;
const GAP = 6;
/** Closest the tip may sit to the viewport edge. */
const EDGE = 8;

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  /** Preferred side; flips when there is no room. */
  side?: Side;
  /**
   * Let a tap open it on touch screens, where there is no hover. Only for
   * triggers a tap does nothing else on -- on a button the tap is the action.
   */
  tapToggle?: boolean;
  /** For `aria-describedby` on the trigger; see Hint. */
  id?: string;
  className?: string;
}

/**
 * Short text shown on hover or keyboard focus.
 *
 * Wraps its children in a span rather than cloning them, so it works around
 * anything -- including a disabled button, which gets no pointer events of
 * its own (`disabled:pointer-events-none`) and so lets them reach the span.
 *
 * Rendered into document.body so a table's overflow or a card's stacking
 * context can't clip it, and above dialogs (z-50) and toasts (z-60).
 *
 * Never the only place something is said: tooltips don't exist on touch
 * screens, and this app runs on phones.
 */
export function Tooltip({ content, children, side = 'top', tapToggle, id, className }: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastPointer = useRef<string>('mouse');
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = (delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
    setPos(null);
  };

  // Measure after render, before paint, so it never flashes at 0,0.
  useLayoutEffect(() => {
    if (!open) return;
    const t = triggerRef.current?.getBoundingClientRect();
    const tip = tipRef.current?.getBoundingClientRect();
    if (!t || !tip) return;

    const above = t.top - tip.height - GAP;
    const below = t.bottom + GAP;
    let top = side === 'top' ? above : below;
    if (side === 'top' && above < EDGE) top = below;
    if (side === 'bottom' && below + tip.height > window.innerHeight - EDGE) top = above;

    const centred = t.left + t.width / 2 - tip.width / 2;
    const left = Math.min(Math.max(centred, EDGE), window.innerWidth - tip.width - EDGE);
    setPos({ top, left });
  }, [open, side, content]);

  // While open: Escape, a tap elsewhere, scrolling or resizing close it. A
  // fixed-position tip left behind by a scroll would point at nothing.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    const onDown = (e: PointerEvent) => {
      if (!triggerRef.current?.contains(e.target as Node)) hide();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [open]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <span
      ref={triggerRef}
      className={cn('inline-flex', className)}
      onPointerEnter={(e) => {
        lastPointer.current = e.pointerType;
        // A touch "enter" is a tap, which is the button's job, not ours.
        if (e.pointerType === 'mouse') show(OPEN_DELAY);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') hide();
      }}
      onPointerDown={(e) => {
        lastPointer.current = e.pointerType;
        // Clicking the thing is the answer to "what does this do"; don't
        // leave the tip floating over whatever dialog it opens.
        if (e.pointerType === 'mouse') hide();
      }}
      onClick={() => {
        if (tapToggle && lastPointer.current !== 'mouse') {
          if (open) hide();
          else show(0);
        }
      }}
      onFocus={(e) => {
        // Keyboard focus only. A click or tap also focuses, and that would
        // reopen the tip the pointerdown just closed.
        if (e.target.matches(':focus-visible')) show(0);
      }}
      onBlur={hide}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            style={{
              position: 'fixed',
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              visibility: pos ? 'visible' : 'hidden',
            }}
            className="pointer-events-none z-[70] max-w-xs animate-fade-in rounded-md bg-foreground px-2.5 py-1.5 text-left text-xs font-normal normal-case leading-snug tracking-normal text-background shadow-md"
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}

/**
 * A term with an explanation: dotted underline, a help cursor, and the
 * explanation on hover, keyboard focus, or a tap on touch screens.
 */
export function Hint({
  tip,
  children,
  className,
}: {
  tip: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <Tooltip content={tip} id={id} tapToggle>
      <span
        tabIndex={0}
        aria-describedby={id}
        className={cn(
          'cursor-help underline decoration-muted-foreground/50 decoration-dotted underline-offset-4',
          'rounded-sm focus-visible:outline-2 focus-visible:outline-ring outline-offset-1',
          className,
        )}
      >
        {children}
      </span>
    </Tooltip>
  );
}
