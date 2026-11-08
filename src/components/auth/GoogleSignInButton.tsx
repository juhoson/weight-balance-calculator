import React from 'react';
import { fetchAuthProviders, session } from '../../api/session';

const GSI_SRC = 'https://accounts.google.com/gsi/client';
let scriptPromise: Promise<void> | null = null;

/** Loads Google Identity Services once. */
function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GSI_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error('Could not load Google sign-in.'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

interface GoogleSignInButtonProps {
  onSuccess: () => void;
  onError: (message: string) => void;
  /** Called with whether Google sign-in is available, so the caller can show a divider. */
  onAvailability?: (available: boolean) => void;
}

/**
 * Google's own "Continue with Google" button (Google Identity Services). Renders nothing when the
 * server has no Google client id configured, or Google's script can't be loaded (e.g. offline).
 */
const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({ onSuccess, onError, onAvailability }) => {
  const container = React.useRef<HTMLDivElement>(null);
  const [available, setAvailable] = React.useState(false);
  // The GIS callback is registered once; keep it pointing at the latest props.
  const handlers = React.useRef({ onSuccess, onError, onAvailability });
  handlers.current = { onSuccess, onError, onAvailability };

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const { google: config } = await fetchAuthProviders();
      if (!config) {
        handlers.current.onAvailability?.(false);
        return;
      }
      try {
        await loadGoogleScript();
      } catch {
        if (!cancelled) handlers.current.onAvailability?.(false);
        return;
      }
      const gsi = window.google?.accounts.id;
      if (cancelled || !gsi || !container.current) return;
      gsi.initialize({
        client_id: config.clientId,
        callback: async ({ credential }) => {
          try {
            await session.signInWithGoogle(credential);
            handlers.current.onSuccess();
          } catch (e) {
            handlers.current.onError(e instanceof Error ? e.message : 'Google sign-in failed.');
          }
        },
        cancel_on_tap_outside: true,
      });
      const dark = document.documentElement.classList.contains('dark');
      gsi.renderButton(container.current, {
        type: 'standard',
        theme: dark ? 'filled_black' : 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'center',
        width: Math.min(container.current.offsetWidth || 320, 400),
      });
      setAvailable(true);
      handlers.current.onAvailability?.(true);
    })();
    return () => { cancelled = true; };
  }, []);

  return <div ref={container} className={available ? 'flex min-h-[44px] justify-center' : 'hidden'} data-testid="google-signin" />;
};

export default GoogleSignInButton;
