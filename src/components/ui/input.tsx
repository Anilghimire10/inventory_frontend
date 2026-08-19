import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
      'placeholder:text-muted-foreground',
      'focus-visible:outline-2 focus-visible:outline-ring outline-offset-0',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
      'placeholder:text-muted-foreground',
      'focus-visible:outline-2 focus-visible:outline-ring outline-offset-0',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
