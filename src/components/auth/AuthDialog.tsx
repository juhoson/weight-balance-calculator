import React from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { session } from '../../api/session';
import GoogleSignInButton from './GoogleSignInButton';

type Mode = 'signIn' | 'register' | 'forgot';

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: Mode;
}

function Field({ id, label, ...props }: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <Input id={id} className="bg-background text-foreground" {...props} />
    </div>
  );
}

/** Sign in or create an account. Closes itself on success. */
const AuthDialog: React.FC<AuthDialogProps> = ({ open, onOpenChange, initialMode = 'signIn' }) => {
  const [mode, setMode] = React.useState<Mode>(initialMode);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [googleAvailable, setGoogleAvailable] = React.useState(false);
  const [resetSentTo, setResetSentTo] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError(null);
      setPassword('');
      setResetSentTo(null);
    }
  }, [open, initialMode]);

  const register = mode === 'register';

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setResetSentTo(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'forgot') {
        await session.requestPasswordReset(email.trim());
        setResetSentTo(email.trim());
        return;
      }
      if (register) {
        await session.register(email.trim(), password, displayName.trim());
      } else {
        await session.signIn(email.trim(), password);
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'forgot') {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>
              Enter your account&apos;s email and we&apos;ll send you a link to choose a new password.
            </DialogDescription>
          </DialogHeader>
          {resetSentTo ? (
            <p role="status" className="text-sm">
              If <strong>{resetSentTo}</strong> has an account, a reset link is on its way. It works for an hour.
              Check your spam folder if it doesn&apos;t arrive within a few minutes.
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <Field id="auth-email" label="Email" type="email" autoComplete="email" required
                value={email} onChange={e => setEmail(e.target.value)} />
              {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Send reset link
              </Button>
            </form>
          )}
          <p className="text-center text-sm">
            <button type="button" className="font-medium text-blue-600 hover:underline dark:text-blue-400"
              onClick={() => switchMode('signIn')}>
              Back to sign in
            </button>
          </p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{register ? 'Create an account' : 'Sign in'}</DialogTitle>
          <DialogDescription>
            {register
              ? 'An account lets you add your own aircraft and use them on any device.'
              : 'Sign in to add aircraft and see your own aircraft in the calculator.'}
          </DialogDescription>
        </DialogHeader>
        <GoogleSignInButton
          onSuccess={() => onOpenChange(false)}
          onError={setError}
          onAvailability={setGoogleAvailable}
        />
        {googleAvailable && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            or with email
            <span className="h-px flex-1 bg-border" />
          </div>
        )}
        <form onSubmit={submit} className="space-y-3">
          {register && (
            <Field id="auth-name" label="Name" autoComplete="name" required maxLength={100}
              value={displayName} onChange={e => setDisplayName(e.target.value)} />
          )}
          <Field id="auth-email" label="Email" type="email" autoComplete="email" required
            value={email} onChange={e => setEmail(e.target.value)} />
          <Field id="auth-password" label="Password" type="password" required
            autoComplete={register ? 'new-password' : 'current-password'}
            minLength={register ? 8 : undefined} maxLength={100}
            value={password} onChange={e => setPassword(e.target.value)} />
          {register && <p className="text-xs text-muted-foreground">At least 8 characters.</p>}
          {!register && (
            <button type="button" className="text-sm text-blue-600 hover:underline dark:text-blue-400"
              onClick={() => switchMode('forgot')}>
              Forgot password?
            </button>
          )}
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {register ? 'Create account' : 'Sign in'}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          {register ? 'Already have an account?' : 'New here?'}{' '}
          <button type="button" className="font-medium text-blue-600 hover:underline dark:text-blue-400"
            onClick={() => switchMode(register ? 'signIn' : 'register')}>
            {register ? 'Sign in' : 'Create an account'}
          </button>
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default AuthDialog;
