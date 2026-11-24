import React from 'react';

const KEY = 'chunkReloadAt';

/**
 * React.lazy that reloads the page once when the chunk can't be loaded: after a deploy, an open
 * page asks for chunks the new version no longer has. A second failure within a minute is thrown
 * to the error boundary instead of reloading in a loop.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithReload<T extends React.ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return React.lazy(() => load().catch((error: unknown) => {
    let last = 0;
    try { last = Number(sessionStorage.getItem(KEY) ?? 0); } catch { /* storage blocked */ }
    if (Date.now() - last > 60_000) {
      try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked */ }
      window.location.reload();
      return new Promise<{ default: T }>(() => { /* the page is reloading */ });
    }
    throw error;
  }));
}
