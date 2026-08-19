'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AuthApi } from '@/api';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { Field } from '@/components/ui/label';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Reusable "change my password" dialog (available to every signed-in user). */
export default function ChangePasswordDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { show } = useToast();
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });

  const changePw = useMutation({
    mutationFn: () => AuthApi.changePassword(pw.currentPassword, pw.newPassword),
    onSuccess: () => {
      show('Password changed');
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      onClose();
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.confirm !== pw.newPassword) {
      show('Passwords do not match', 'error');
      return;
    }
    changePw.mutate();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Change password">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Current password">
          <PasswordInput
            value={pw.currentPassword}
            onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))}
            required
            autoFocus
          />
        </Field>
        <Field label="New password">
          <PasswordInput
            value={pw.newPassword}
            onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))}
            placeholder="At least 8 characters"
            minLength={8}
            required
          />
        </Field>
        <Field label="Confirm new password">
          <PasswordInput
            value={pw.confirm}
            onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
            placeholder="Re-enter your new password"
            minLength={8}
            required
            className={cn(
              pw.confirm && pw.confirm !== pw.newPassword && 'border-destructive focus-visible:outline-destructive',
            )}
          />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={changePw.isPending}>
            Update password
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
