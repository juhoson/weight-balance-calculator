import React from 'react';
import { session } from '../../api/session';
import { nativePlatform } from '../../lib/native';

/**
 * Sign in with Apple, in the iOS app only (Apple asks for it next to Google's sign-in there).
 * Apple gives the name only on the first sign-in, so it is passed on to the server then.
 */
const AppleSignInButton: React.FC<{ onSuccess: () => void; onError: (message: string) => void }> = ({ onSuccess, onError }) => {
  if (nativePlatform() !== 'ios') return null;
  const signIn = async () => {
    try {
      const { SocialLogin } = await import('@capgo/capacitor-social-login');
      await SocialLogin.initialize({ apple: {} });
      const { result } = await SocialLogin.login({ provider: 'apple', options: { scopes: ['email', 'name'] } });
      if (!('idToken' in result) || !result.idToken) throw new Error('Apple sign-in gave no account.');
      const profile = 'profile' in result ? result.profile as { givenName?: string | null; familyName?: string | null } : null;
      const name = [profile?.givenName, profile?.familyName].filter(Boolean).join(' ') || null;
      await session.signInWithApple(result.idToken, name);
      onSuccess();
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      if (/cancel|1001/i.test(message)) return; // closed Apple's sheet
      onError(message || 'Apple sign-in failed.');
    }
  };
  return (
    <button type="button" onClick={signIn}
      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md bg-black px-4 font-medium text-white hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/85">
      <svg aria-hidden="true" viewBox="0 0 814 1000" className="h-4 w-4 fill-current">
        <path d="M788 341c-6 4-108 62-108 190 0 148 130 200 134 202-1 3-21 72-69 142-43 62-88 124-156 124s-86-40-164-40c-77 0-104 41-167 41s-106-58-156-128C44 790 0 669 0 554c0-185 120-283 239-283 63 0 115 41 155 41 38 0 97-44 169-44 27 0 126 3 191 95zM554 168c30-35 51-84 51-133 0-7-1-14-2-19-48 2-106 32-140 72-27 31-53 80-53 130 0 8 1 15 2 18 3 0 8 1 13 1 43 0 98-29 129-69z"/>
      </svg>
      Sign in with Apple
    </button>
  );
};

export default AppleSignInButton;
