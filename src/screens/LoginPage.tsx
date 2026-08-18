'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Package, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Field } from '@/components/ui/label';
import { apiError } from '@/lib/api';

export default function LoginPage() {
  const { user, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) router.replace('/');
  }, [user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.replace('/');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="text-xl font-semibold">Welcome back</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Sign in to your inventory dashboard.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@business.com"
            required
            autoFocus
          />
        </Field>
        <Field label="Password">
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" loading={loading}>
          Sign in
        </Button>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link
          href="/forgot-password"
          className="font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          Forgot your password?
        </Link>
      </p>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New business?{' '}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  const features = [
    'Point of Sale with barcode scanning',
    'Real-time stock & expiry tracking',
    'Sales, credit & profit analytics',
  ];
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel — mirrors the app's sidebar/header look */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_45%)]" />
        <div className="relative flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-foreground/15">
            <Package className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">Inventory Manager</span>
        </div>
        <div className="relative">
          <h2 className="max-w-sm text-3xl font-semibold leading-tight tracking-tight">
            Run your store from one place.
          </h2>
          <p className="mt-3 max-w-sm text-sm text-primary-foreground/85">
            POS, stock, customers, credit and analytics — everything your business needs, in a single dashboard.
          </p>
          <ul className="mt-8 space-y-3">
            {features.map((f) => (
              <li key={f} className="flex items-center gap-3 text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary-foreground/90" />
                <span className="text-primary-foreground/90">{f}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-primary-foreground/70">
          © {new Date().getFullYear()} Inventory Manager
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-muted/30 p-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center justify-center gap-2 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Package className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold">Inventory Manager</span>
          </div>
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
