'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { apiError } from '@/lib/api';
import { CURRENCIES } from '@/lib/currencies';
import { AuthShell } from './LoginPage';

export default function RegisterPage() {
  const { user, register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    businessName: '',
    businessType: 'GROCERY',
    currency: 'USD',
    name: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) router.replace('/');
  }, [user, router]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form);
      router.replace('/');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="text-xl font-semibold">Create your business</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Set up your account — you'll be the owner.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Business name">
          <Input value={form.businessName} onChange={set('businessName')} required autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Business type">
            <Select value={form.businessType} onChange={set('businessType')}>
              <option value="GROCERY">Grocery</option>
              <option value="PHARMACY">Pharmacy</option>
              <option value="RETAIL">Retail</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>
          <Field label="Currency">
            <Select value={form.currency} onChange={set('currency')}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Your name">
          <Input value={form.name} onChange={set('name')} required />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={set('email')} required />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            value={form.password}
            onChange={set('password')}
            placeholder="At least 8 characters"
            minLength={8}
            required
          />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" loading={loading}>
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
