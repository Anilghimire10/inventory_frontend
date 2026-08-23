'use client';
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Keep a stable ref so the open effect doesn't re-run (and re-steal focus)
  // on every parent re-render when an inline onClose is passed.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      // Trap focus inside the dialog.
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
    // Move focus into the dialog once it opens, skipping the close button.
    const active = document.activeElement;
    const focusables = panel?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]):not([aria-label="Close"]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusables && focusables[0];
    first?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      if (active instanceof HTMLElement) active.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:p-4 sm:items-center">
      <div
        className="fixed inset-0 bg-black/50 animate-fade-in"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={cn(
          'relative z-10 my-4 sm:my-8 flex max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-4rem)] w-full max-w-lg flex-col rounded-lg border border-border bg-card p-4 sm:p-6 shadow-lg animate-slide-up',
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-accent"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        {title && <h2 id={titleId} className="pr-8 text-lg font-semibold">{title}</h2>}
        {description && (
          <p id={descId} className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
        {/* Body scrolls on its own so tall dialogs never clip their top/footer. */}
        <div className={cn('min-h-0 flex-1 overflow-y-auto', title && 'mt-4')}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mt-6 flex flex-wrap justify-end gap-2', className)}
      {...props}
    />
  );
}
