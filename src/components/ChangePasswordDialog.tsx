'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AuthApi } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';

/** Reusable "change my password" dialog (available to every signed-in user). */
export default function ChangePasswordDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { show } = useToast();
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });

  const changePw = useMutation({
    mutationFn: () => AuthApi.changePassword(pw.currentPassword, pw.newPassword),
    onSuccess: () => {
      show('Password changed');
      setPw({ currentPassword: '', newPassword: '' });
      onClose();
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  return (
    <Dialog open={open} onClose={onClose} title="Change password">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          changePw.mutate();
        }}
        className="space-y-4"
      >
        <Field label="Current password">
          <Input
            type="password"
            value={pw.currentPassword}
            onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))}
            required
            autoFocus
          />
        </Field>
        <Field label="New password">
          <Input
            type="password"
            value={pw.newPassword}
            onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))}
            placeholder="At least 8 characters"
            minLength={8}
            required
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
