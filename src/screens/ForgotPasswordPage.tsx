'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthApi } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Field } from '@/components/ui/label';
import { apiError } from '@/lib/api';
import { AuthShell } from './LoginPage';
import { cn } from '@/lib/utils';

export default function ForgotPasswordPage() {
  const router = useRouter();
  // 'request' -> ask for email; 'reset' -> enter code + new password.
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const request = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await AuthApi.forgotPassword(email);
      setInfo(res.message);
      setStep('reset');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (confirm !== password) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await AuthApi.resetPassword(email, code.trim(), password);
      router.replace('/login');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="text-xl font-semibold">Reset your password</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        {step === 'request'
          ? "Enter your email and we'll send you a reset code."
          : `Enter the code sent to ${email} and choose a new password.`}
      </p>

      {step === 'request' ? (
        <form onSubmit={request} className="space-y-4">
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" loading={loading}>
            Send reset code
          </Button>
        </form>
      ) : (
        <form onSubmit={reset} className="space-y-4">
          <Field label="Reset code">
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
          <Field label="New password">
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              minLength={8}
              required
            />
          </Field>
          <Field label="Confirm new password">
            <PasswordInput
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter your new password"
              minLength={8}
              required
              className={cn(
                confirm && confirm !== password && 'border-destructive focus-visible:outline-destructive',
              )}
            />
          </Field>
          {info && <p className="text-sm text-primary">{info}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" loading={loading}>
            Set new password
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered it?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
