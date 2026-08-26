'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { useAuth } from '@/auth/AuthContext';
import { AuthApi } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { PasswordInput } from '@/components/ui/password-input';
import { Field } from '@/components/ui/label';
import { apiError } from '@/lib/api';
import { CURRENCIES } from '@/lib/currencies';
import { cn } from '@/lib/utils';
import { AuthShell } from './LoginPage';

export default function RegisterPage() {
  const { user, register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    businessName: '',
    businessType: 'GROCERY',
    salesModel: 'RETAIL',
    currency: 'USD',
    name: '',
    email: '',
    password: '',
  });
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Once registered, we switch to the email-verification step.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  // "Email already in use" can mean a real duplicate, but can also mean this
  // exact email was already created by a previous attempt (e.g. the request
  // succeeded server-side but the response never reached the browser) --
  // give the user a way forward instead of a dead-end error.
  const [maybeAlreadyRegistered, setMaybeAlreadyRegistered] = useState(false);

  useEffect(() => {
    if (user) router.replace('/');
  }, [user, router]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMaybeAlreadyRegistered(false);
    if (form.password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await register(form);
      setPendingEmail(res.email);
    } catch (err) {
      setError(apiError(err));
      setMaybeAlreadyRegistered(axios.isAxiosError(err) && err.response?.status === 409);
    } finally {
      setLoading(false);
    }
  };

  if (pendingEmail) {
    return <VerifyStep email={pendingEmail} onVerified={() => router.replace('/')} />;
  }

  return (
    <AuthShell>
      <h1 className="text-xl font-semibold">Create your business</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Set up your account — you&apos;ll be the owner.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Business name">
          <Input value={form.businessName} onChange={set('businessName')} required autoFocus />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Business type">
            <Select value={form.businessType} onChange={set('businessType')}>
              <option value="GROCERY">Grocery</option>
              <option value="PHARMACY">Pharmacy</option>
              <option value="RETAIL">Retail</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>
          <Field label="Sells as">
            <Select value={form.salesModel} onChange={set('salesModel')}>
              <option value="RETAIL">Retailer</option>
              <option value="WHOLESALE">Wholesaler</option>
            </Select>
          </Field>
        </div>
        <Field label="Currency">
          <Select value={form.currency} onChange={set('currency')}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Your name">
          <Input value={form.name} onChange={set('name')} required />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={set('email')} required />
        </Field>
        <Field label="Password">
          <PasswordInput
            value={form.password}
            onChange={set('password')}
            placeholder="At least 8 characters"
            minLength={8}
            required
          />
        </Field>
        <Field label="Confirm password">
          <PasswordInput
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter your password"
            minLength={8}
            required
            className={cn(
              confirm && confirm !== form.password && 'border-destructive focus-visible:outline-destructive',
            )}
          />
          {confirm && confirm !== form.password && (
            <p className="mt-1 text-xs text-destructive">Passwords do not match.</p>
          )}
        </Field>
        {error && (
          <div className="text-sm text-destructive">
            <p>{error}</p>
            {maybeAlreadyRegistered && (
              <p className="mt-1">
                Already have a verification code for this email?{' '}
                <button
                  type="button"
                  onClick={() => setPendingEmail(form.email)}
                  className="font-medium text-primary hover:underline"
                >
                  Enter it here
                </button>
                .
              </p>
            )}
          </div>
        )}
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

/** Step 2 of signup: enter the 6-digit code emailed to the user. */
function VerifyStep({
  email,
  onVerified,
}: {
  email: string;
  onVerified: () => void;
}) {
  const { verifyEmail } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await verifyEmail(email, code.trim());
      onVerified();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setError('');
    setInfo('');
    try {
      await AuthApi.resendVerification(email);
      setInfo('A new code has been sent.');
    } catch (err) {
      setError(apiError(err));
    }
  };

  return (
    <AuthShell>
      <h1 className="text-xl font-semibold">Verify your email</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        We sent a 6-digit code to <span className="font-medium">{email}</span>.
        Enter it below to finish setting up your account.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Verification code">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            inputMode="numeric"
            maxLength={6}
            required
            autoFocus
          />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {info && <p className="text-sm text-primary">{info}</p>}
        <Button type="submit" className="w-full" loading={loading}>
          Verify & continue
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Didn&apos;t get it?{' '}
        <button onClick={resend} className="font-medium text-primary hover:underline">
          Resend code
        </button>
      </p>
    </AuthShell>
  );
}
