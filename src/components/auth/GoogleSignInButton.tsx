import React from 'react';
import { fetchAuthProviders, session } from '../../api/session';
import { isNative, nativePlatform } from '../../lib/native';

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

interface NativeGoogle { webClientId: string; iosClientId?: string }

const GoogleLogo: React.FC = () => (
  <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.2 5.6c4.2-3.9 7.1-9.6 7.1-17.1z"/>
    <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.9-6.1z"/>
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2.2 1.5-5 2.4-8.7 2.4-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/>
  </svg>
);

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

  const [nativeConfig, setNativeConfig] = React.useState<NativeGoogle | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const { google: config } = await fetchAuthProviders();
      if (!config) {
        handlers.current.onAvailability?.(false);
        return;
      }
      // The app: Google's own sign-in on the device (Google refuses its web button inside an app).
      if (isNative()) {
        const ios = nativePlatform() === 'ios';
        const usable = !ios || !!config.iosClientId;
        if (!cancelled) {
          if (usable) setNativeConfig({ webClientId: config.clientId, iosClientId: config.iosClientId ?? undefined });
          handlers.current.onAvailability?.(usable);
        }
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

  if (nativeConfig) {
    const signIn = async () => {
      try {
        const { SocialLogin } = await import('@capgo/capacitor-social-login');
        await SocialLogin.initialize({ google: { webClientId: nativeConfig.webClientId, iOSClientId: nativeConfig.iosClientId, mode: 'online' } });
        // No scopes: email and profile are the default, and Android refuses any list on a stock activity.
        const { result } = await SocialLogin.login({ provider: 'google', options: {} });
        const idToken = 'idToken' in result ? result.idToken : null;
        if (!idToken) throw new Error('Google sign-in gave no account.');
        await session.signInWithGoogle(idToken);
        handlers.current.onSuccess();
      } catch (e) {
        const message = e instanceof Error ? e.message : '';
        // Closing Google's sheet is not an error.
        if (/cancel/i.test(message)) return;
        handlers.current.onError(message || 'Google sign-in failed.');
      }
    };
    return (
      <button type="button" onClick={signIn} data-testid="google-signin"
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 font-medium hover:bg-muted">
        <GoogleLogo/> Continue with Google
      </button>
    );
  }

  return <div ref={container} className={available ? 'flex min-h-[44px] justify-center' : 'hidden'} data-testid="google-signin" />;
};

export default GoogleSignInButton;
