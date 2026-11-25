# The iOS and Android apps: from this repo to the stores

The apps are the React app inside a native shell (Capacitor 8). This repo already has the
`ios/` and `android/` projects:

| | |
|---|---|
| Bundle ID / application ID | `com.flightplanningtool.app` |
| Name on the home screen | Flight Planning Tool |
| iOS minimum | 15.0 |
| Android minimum / target | API 24 / API 36 |
| Version | 1.0 (build 1) |

The steps are in order. Parts A–C are done once. Parts D and E are each platform's first release, and
Part F covers every release after that.

---

## Part A: Before either store (blockers)

Both stores reject the app without these. Both are code changes (ask Claude):

1. **Deleting your account in the app.** Apple (guideline 5.1.1(v)) and Google Play both require
   in-app account deletion for any app that creates accounts. Today only an admin can delete a user.
2. **A privacy policy page** at a public URL, e.g. `https://www.flightplanningtool.com/privacy`.
   It must cover what the app collects: email and name (account), Google sign-in, location (the
   navigation mode only, while open, not sent anywhere except flights you save), saved routes and
   flights, and Umami usage statistics.
3. **Apple's sign-in rule (guideline 4.8).** An app that offers Google sign-in must also offer a
   sign-in that keeps the email private. The usual answer is **Sign in with Apple**: the
   sign-in plugin already supports it, and the backend needs a matching endpoint. Reviewers may
   accept your own email-and-password sign-in as the alternative, but that isn't certain. Adding
   Sign in with Apple avoids a rejection.

---

## Part B: Backend settings (Railway, once)

1. Railway → the backend service → **Variables**:
   - `CORS_ALLOWED_ORIGINS`: add the apps' origins to the existing list, separated by commas:
     `…existing…,capacitor://localhost,https://localhost`
     (iOS serves the app from `capacitor://localhost` and Android from `https://localhost`.
     Without them the apps can't reach the API.)
   - `GOOGLE_IOS_CLIENT_ID`: the iOS client ID from step C2 below.
2. Redeploy (`railway up` from the backend repo), then check:
   `curl https://backend-production-b553.up.railway.app/api/auth/providers` shows `iosClientId`.

## Part C: Google sign-in (Google Cloud Console, once)

Open the project that has the existing web client
(`174375176210-…apps.googleusercontent.com`) → **APIs & Services → Credentials**.

1. **OAuth consent screen:** make sure it's **In production** (not "Testing"), or only test users
   can sign in.
2. **iOS client:** Create credentials → OAuth client ID → **iOS**.
   - Bundle ID: `com.flightplanningtool.app`
   - Copy the **client ID** to Railway (`GOOGLE_IOS_CLIENT_ID`, Part B).
   - Copy the **iOS URL scheme** (the client ID reversed:
     `com.googleusercontent.apps.123…`) for step D3.
3. **Android clients:** Create credentials → OAuth client ID → **Android**, one per signing key, each with
   package name `com.flightplanningtool.app` and that key's **SHA-1**:
   - the debug key, for running from Android Studio (E2 shows how to get it);
   - the upload key (E4);
   - the Play App Signing key, from Play Console after the first upload (E7).

   The app itself uses the **web** client ID on Android: the Android clients only register the
   package and its keys. Nothing to copy.

---

## Part D: iOS

### D1. App icon and splash screen (once; Android uses the same files)

1. Put a **1024×1024 PNG** icon without transparency at `resources/icon.png`, and optionally a
   2732×2732 splash at `resources/splash.png` (logo centred, plain background `#0f172a`).
2. `npx @capacitor/assets generate --iconBackgroundColor '#ffffff' --splashBackgroundColor '#0f172a'`
   This writes every iOS and Android size. Commit the result.

### D2. Build and open in Xcode

```sh
npm ci
npm run app:ios      # builds the web app for the app, copies it in, opens Xcode
```

### D3. Xcode settings (once)

In Xcode, select the **App** project → the **App** target:

1. **Signing & Capabilities:** tick *Automatically manage signing* and choose your **Team**. Xcode
   registers the bundle ID with your Apple account.
2. **Info → URL Types → +:** set *URL Schemes* to the iOS URL scheme from C2
   (`com.googleusercontent.apps.…`). Google's sign-in returns to the app through it.
3. **General → Supported Destinations:** iPhone and iPad (both are set up).
4. Commit the changes to `ios/` (no secrets in them).

### D4. Run it on your iPhone/iPad

1. Connect the device and select it at the top of Xcode. The first time: on the device, **Settings →
   Privacy & Security → Developer Mode → On**, and restart.
2. Press **Run** (▶).
3. Check:
   - email sign-in and Google sign-in;
   - plan a route through all five steps;
   - Start navigation: it asks for location once, then shows the GPS position, the status bar
     goes, and the screen stays on;
   - **Keep offline** for the route, then airplane mode: the map and airspace still show;
   - close the app mid-flight and reopen it: "Resume with GPS".

### D5. App Store Connect: the app record (once)

<https://appstoreconnect.apple.com> → **Apps → + → New App**:

- Platform iOS, name **Flight Planning Tool** (it must be unique in the store; pick another if it's
  taken), language English, bundle ID `com.flightplanningtool.app`, SKU e.g. `fpt-ios`.

Then fill in, under the app:

- **App Information:** category *Navigation* (secondary *Utilities*), privacy policy URL (Part A).
- **App Privacy:**
  - Contact info: email address and name. Linked to the user, for app functionality.
  - Location: precise location, for app functionality. Linked to the user only if flights are
    saved to the account.
  - Usage data: product interaction (Umami), for analytics, not linked.
  - User content: saved routes and flights.
  - No tracking.
- **Pricing and Availability:** free; the countries to sell in.
- **Age rating:** answer the questionnaire (no objectionable content, so 4+).

### D6. Upload a build

1. In Xcode, set the destination to **Any iOS Device (arm64)**.
2. **Product → Archive.** The Organizer opens when it's done.
3. **Distribute App → App Store Connect → Upload.** Keep the defaults, including automatic signing.
4. After about 10–30 minutes the build shows in App Store Connect → **TestFlight**. Answer the
   export compliance question, if it asks, with "None of the algorithms…". `Info.plist` already says the app
   uses no custom encryption.

### D7. TestFlight

TestFlight → **Internal Testing → +** → add yourself (and club members as external testers; the
first external build gets a short review). Install with the TestFlight app and repeat the D4
checks on a real flight.

### D8. Submit for review

App Store tab → version 1.0:

- **Screenshots:** 6.9" iPhone (1320×2868) and 13" iPad (2064×2752), 3–10 each. Take them in the
  simulator (iPhone 17 Pro Max / iPad Pro 13") with ⌘S.
- Description, keywords (*weight and balance, VFR, navigation, flight planning, airspace,
  Cessna, Piper, Diamond*), support URL, and the build from D6.
- **App Review Information:**
  - Sign-in required: **yes**. Give a demo account (email and password) with an aircraft and a saved
    route, because the navigation mode needs a signed-in user.
  - Notes: "VFR planning aid for pilots. The navigation mode uses the device's GPS while open
    (foreground only) and keeps working offline. Demo flight: Navigation mode → Demo."
    Apple rejects apps that are "just a website" (guideline 4.2), so point at what is native:
    the GPS, the screen kept on, offline maps.
- **Submit for Review.** Review usually takes 1–3 days.

---

## Part E: Android

### E1. Install Android Studio (once)

1. Install Android Studio from <https://developer.android.com/studio>. It includes its own JDK.
2. In its first-run wizard, install the latest **Android SDK** and the **SDK Platform 36**.
3. Add to `~/.zshrc`, so the command line finds the SDK:
   ```sh
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export PATH="$ANDROID_HOME/platform-tools:$PATH"
   ```

### E2. Build, open and run

```sh
npm run app:android     # builds the web app, copies it in, opens Android Studio
```

1. Wait for the Gradle sync to finish.
2. On the phone: **Settings → About phone →** tap *Build number* 7 times. Then **Developer options →
   USB debugging**. Connect it and pick it at the top of Android Studio.
3. Press **Run** (▶) and run the same checks as D4.
4. **Debug SHA-1** for Google sign-in (C3): `cd android && ./gradlew signingReport`. Use the
   `SHA1:` line under `Variant: debug`.

### E3. Icon and splash

Same files and command as D1 (one run makes both platforms).

### E4. Upload key (once: keep it safe, never in git)

```sh
keytool -genkeypair -v -keystore ~/keys/flightplanningtool-upload.jks \
  -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Save the passwords in your password manager, and back up the `.jks` file. Its SHA-1 for C3:
`keytool -list -v -keystore ~/keys/flightplanningtool-upload.jks -alias upload`.

### E5. Signed release bundle

Android Studio → **Build → Generate Signed App Bundle or APK → Android App Bundle →**
choose the keystore from E4 → *release*. The file is
`android/app/release/app-release.aab`.

### E6. Play Console: the app (once)

<https://play.google.com/console> → **Create app**: name *Flight Planning Tool*, app, free. Then
work through **Dashboard → Set up your app**:

- privacy policy URL (Part A);
- app access: sign-in required, so give the same demo account as D8;
- ads: none;
- content rating questionnaire;
- target audience: 18+ (this avoids the families policy);
- **Data safety:**
  - Location: precise, collected, for app functionality, optional. Location sharing is limited to flights the user saves.
  - Personal info: name and email, for account management.
  - App activity: usage (Umami), for analytics.
  - Data encrypted in transit: yes.
  - Users can delete their data: yes (Part A).
- store listing: short and full description, a 512×512 icon, a 1024×500 feature graphic, and phone
  screenshots (and 7"/10" tablet ones for the tablet listing).

### E7. Testing, then production

1. **Testing → Internal testing → Create release:**
   - Accept **Play App Signing** when it asks.
   - Upload the `.aab` from E5.
   - Add testers by email and share the opt-in link.
2. **Play App Signing SHA-1:** Setup → **App integrity → App signing key certificate**. Add it as
   another Android OAuth client (C3). Without it, Google sign-in fails in apps installed from Play.
3. **A personal developer account (created after Nov 2023)** must run a **closed test with at least
   12 testers for 14 days** before it can apply for production. Club members work well as testers.
   Organisation accounts skip this.
4. **Production → Create release** with the same bundle. Review takes from a few hours to about a week.

The app uses location only while it's open (foreground), so Play's background-location declaration
doesn't apply.

---

## Part F: Every release after the first

The app carries its own copy of the web app, so changes to the website don't reach installed
apps until you publish a new app version.

1. Raise the version:
   - iOS: Xcode → target → General → *Version* (e.g. 1.1) and *Build* (+1 each upload).
   - Android: `android/app/build.gradle` → `versionName "1.1"` and `versionCode` +1 each upload.
2. `npm run app:build` (or `app:ios` / `app:android`), then D6 → D8 and E5 → E7.

Backend changes reach the apps at once, as long as they're compatible with the app versions people
still have installed.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| App shows "can't reach the server" / sign-in fails at once | `CORS_ALLOWED_ORIGINS` is missing the app's origin (Part B). |
| iOS: no Google button | `GOOGLE_IOS_CLIENT_ID` not set on Railway (B, C2). |
| iOS: Google sheet opens, then nothing | URL scheme missing in Xcode (D3.2). |
| Android: Google sign-in "cancelled" or error 10 | That build's SHA-1 isn't registered (C3). Logcat filter `GoogleProvider` prints the SHA-1 it used. |
| Map blank offline | The route wasn't saved with **Keep offline** while online. |
| Location never asked on iOS | The Info.plist usage text is present; check Settings → Flight Planning Tool → Location. |
