'use client';
import { cloneElement, isValidElement, useId } from 'react';
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
  const child = isValidElement(children)
    ? cloneElement(
        children as React.ReactElement<{
          id?: string;
          'aria-describedby'?: string;
          'aria-invalid'?: boolean;
        }>,
        {
          ...(label ? { id } : null),
          ...(error ? { 'aria-describedby': errorId, 'aria-invalid': true } : null),
        },
      )
    : children;
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