import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        // No vertical padding: a single-line control centres its own text in
        // the content box, so the height alone positions it. py-2 here meant a
        // caller passing a shorter h-* (the header's h-8) kept the 16px of
        // padding and left a 14px box for a 20px line -- the text overflowed
        // and looked like it was sinking out of the control.
        'flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 pr-9 py-0 text-sm',
        'focus-visible:outline-2 focus-visible:outline-ring outline-offset-0',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
  </div>
));
Select.displayName = 'Select';
