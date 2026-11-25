import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import {initAnalytics} from './lib/analytics';
import {isNative} from './lib/native';
import {installTileCache} from './lib/tileCache';

initAnalytics();
if (isNative()) installTileCache();

// Keeps the app and a route's map for the navigation mode without a connection (public/sw.js).
// Not in the iOS/Android app: it carries the app itself, and lib/tileCache.ts keeps the tiles.
if (process.env.NODE_ENV === 'production' && !isNative() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${process.env.PUBLIC_URL}/sw.js`).catch(() => undefined);
  });
}

const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);