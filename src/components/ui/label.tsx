'use client';
import { Children, cloneElement, isValidElement, useId } from 'react';
import { cn } from '@/lib/utils';

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        'mb-1.5 block text-sm font-medium text-foreground',
        className,
      )}
      {...props}
    />
  );
}

/** Label + control wrapper with optional error text. */
export function Field({
  label,
  htmlFor,
  error,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const autoId = useId();
  const id = htmlFor ?? autoId;
  const errorId = `${id}-error`;
  // The control is the first element child; a Field may also carry a hint or
  // inline message after it, which is left untouched. Cloning only when
  // `children` was a lone element silently dropped the label association on
  // every Field holding more than one child.
  const items = Children.toArray(children);
  const controlIdx = items.findIndex(isValidElement);
  const child = items.map((c, i) =>
    i === controlIdx && isValidElement(c)
      ? cloneElement(
          c as React.ReactElement<{
            id?: string;
            'aria-describedby'?: string;
            'aria-invalid'?: boolean;
          }>,
          {
            ...(label ? { id } : null),
            ...(error ? { 'aria-describedby': errorId, 'aria-invalid': true } : null),
          },
        )
      : c,
  );
  return (
    <div className={className}>
      {label && <Label htmlFor={id}>{label}</Label>}
      {child}
      {error && (
        <p className="mt-1 text-xs text-destructive" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}