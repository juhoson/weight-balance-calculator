import type { CapacitorConfig } from '@capacitor/cli';

// The iOS and Android apps: the React build (npm run build) in a native shell. `npm run cap:sync`
// rebuilds it and copies it in; open the projects with `npx cap open ios|android`.
const config: CapacitorConfig = {
  appId: 'com.flightplanningtool.app',
  appName: 'Flight Planning Tool',
  webDir: 'build',
  ios: {
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#0f172a', showSpinner: false },
    StatusBar: { overlaysWebView: true, style: 'DARK' },
    // Only the sign-ins the app offers: Facebook's SDK would bring the advertising ID (AD_ID) along.
    SocialLogin: { providers: { google: true, apple: true, facebook: false, twitter: false } },
  },
};

export default config;
