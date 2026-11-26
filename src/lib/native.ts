/**
 * The iOS and Android apps (Capacitor) next to the web app: what differs is here, so the rest of
 * the app asks one place. In a browser everything falls back to the web APIs.
 */
import { Capacitor } from '@capacitor/core';

export const isNative = (): boolean => Capacitor.isNativePlatform();
export const nativePlatform = (): 'ios' | 'android' | 'web' => Capacitor.getPlatform() as 'ios' | 'android' | 'web';

/** The web app's address: links shared from the app point there, not at the app's own origin. */
export const WEB_APP_URL = 'https://www.flightplanningtool.com/';

export interface Position {
  coords: Pick<GeolocationCoordinates, 'latitude' | 'longitude' | 'altitude' | 'accuracy' | 'speed' | 'heading'>;
  timestamp: number;
}
export interface PositionError { denied: boolean }

/** Follows the position until the returned function is called. */
export function watchPosition(onPosition: (p: Position) => void, onError: (e: PositionError) => void,
  options: PositionOptions = {}): () => void {
  if (isNative()) {
    let id: string | null = null;
    let stopped = false;
    import('@capacitor/geolocation').then(async ({ Geolocation }) => {
      try {
        const asked = await Geolocation.requestPermissions({ permissions: ['location'] });
        if (asked.location === 'denied') { onError({ denied: true }); return; }
      } catch { /* the watch below asks too */ }
      if (stopped) return;
      id = await Geolocation.watchPosition(
        { enableHighAccuracy: options.enableHighAccuracy ?? false, timeout: options.timeout, maximumAge: options.maximumAge },
        (p, err) => {
          if (p) onPosition({ coords: p.coords, timestamp: p.timestamp });
          else if (err) onError({ denied: /denied|permission/i.test(String((err as { message?: string }).message ?? err)) });
        });
      if (stopped) Geolocation.clearWatch({ id }).catch(() => undefined);
    }).catch(() => onError({ denied: false }));
    return () => {
      stopped = true;
      const watching = id;
      if (watching) import('@capacitor/geolocation').then(({ Geolocation }) => Geolocation.clearWatch({ id: watching })).catch(() => undefined);
    };
  }
  if (!navigator.geolocation) {
    onError({ denied: false });
    return () => undefined;
  }
  const id = navigator.geolocation.watchPosition(
    p => onPosition({ coords: p.coords, timestamp: p.timestamp }),
    e => onError({ denied: e.code === e.PERMISSION_DENIED }),
    options,
  );
  return () => navigator.geolocation.clearWatch(id);
}

/** The position once (asks the first time). */
export function currentPosition(options: PositionOptions = {}): Promise<Position> {
  return new Promise((resolve, reject) => {
    const stop = watchPosition(p => { stop(); resolve(p); }, e => { stop(); reject(e); }, options);
  });
}

/** Keeps the screen on in the app (natively; the web app uses the Wake Lock API). */
export async function keepScreenOn(on: boolean): Promise<void> {
  if (!isNative()) return;
  try {
    const { KeepAwake } = await import('@capacitor-community/keep-awake');
    await (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep());
  } catch { /* not available */ }
}

/** Hides the status bar for the navigation mode's full screen, and brings it back. */
export async function fullScreen(on: boolean): Promise<void> {
  if (!isNative()) {
    if (on) document.documentElement.requestFullscreen?.().catch(() => undefined);
    else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    return;
  }
  try {
    const { StatusBar } = await import('@capacitor/status-bar');
    await (on ? StatusBar.hide() : StatusBar.show());
  } catch { /* not available */ }
}
