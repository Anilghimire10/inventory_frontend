'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastCtx {
  show: (message: string, type?: ToastType) => void;
}

const Ctx = createContext<ToastCtx>({ show: () => {} });

export const useToast = () => useContext(Ctx);

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback(
    (id: number) => setToasts((t) => t.filter((x) => x.id !== id)),
    [],
  );

  const show = useCallback(
    (message: string, type: ToastType = 'success') => {
      const id = ++counter;
      setToasts((t) => [...t, { id, type, message }]);
      setTimeout(() => remove(id), 4000);
    },
    [remove],
  );

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const Icon =
    toast.type === 'success'
      ? CheckCircle2
      : toast.type === 'error'
        ? XCircle
        : Info;
  const tone =
    toast.type === 'success'
      ? 'text-success'
      : toast.type === 'error'
        ? 'text-destructive'
        : 'text-primary';
  useEffect(() => {}, []);
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 shadow-lg animate-slide-up">
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', tone)} />
      <p className="flex-1 text-sm">{toast.message}</p>
      <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
