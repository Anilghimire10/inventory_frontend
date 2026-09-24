'use client';
import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Text input with a built-in show/hide toggle for password fields. */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={show ? 'text' : 'password'} className={cn('pr-10', className)} {...props} />
      <Tooltip
        content={show ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-1/2 -translate-y-1/2"
      >
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={show ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </Tooltip>
    </div>
  );
});
PasswordInput.displayName = 'PasswordInput';