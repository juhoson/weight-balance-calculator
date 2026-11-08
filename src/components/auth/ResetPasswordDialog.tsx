import React from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import AuthDialog from './AuthDialog';
import { session } from '../../api/session';

const HASH_KEY = 'reset-token';

/**
 * Reads the token from an emailed link (#reset-token=...) and removes it from the address bar,
 * so it doesn't linger in history or get copied along with the URL.
 */
export function takeResetTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const token = params.get(HASH_KEY);
  if (!token) return null;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return token;
}

/** Opens itself when the page was loaded from a password reset email. */
const ResetPasswordDialog: React.FC = () => {
  const [token] = React.useState(takeResetTokenFromUrl);
  const [open, setOpen] = React.useState(token !== null);
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [signInOpen, setSignInOpen] = React.useState(false);

  if (!token) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('The passwords don\'t match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await session.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset the password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{done ? 'Password changed' : 'Choose a new password'}</DialogTitle>
            {!done && <DialogDescription>At least 8 characters.</DialogDescription>}
          </DialogHeader>
          {done ? (
            <div className="space-y-3">
              <p role="status" className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                Your password has been changed, and any other devices have been signed out.
              </p>
              <Button className="w-full" onClick={() => { setOpen(false); setSignInOpen(true); }}>
                Sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="reset-password" className="text-sm font-medium">New password</label>
                <Input id="reset-password" type="password" autoComplete="new-password" required minLength={8}
                  maxLength={100} value={password} onChange={e => setPassword(e.target.value)}
                  className="bg-background text-foreground" />
              </div>
              <div className="space-y-1">
                <label htmlFor="reset-confirm" className="text-sm font-medium">Repeat new password</label>
                <Input id="reset-confirm" type="password" autoComplete="new-password" required minLength={8}
                  maxLength={100} value={confirm} onChange={e => setConfirm(e.target.value)}
                  className="bg-background text-foreground" />
              </div>
              {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Set new password
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <AuthDialog open={signInOpen} onOpenChange={setSignInOpen} />
    </>
  );
};

export default ResetPasswordDialog;
