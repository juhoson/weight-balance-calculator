import React from 'react';

interface State {
  error: Error | null;
}

/**
 * Instead of a blank page when something fails to render: what went wrong and a way out. A code
 * chunk that failed to load (a deploy replaced it) is the usual cause, and a reload fixes it.
 */
export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error('The app failed to render:', error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = /Loading (CSS )?chunk|ChunkLoadError|dynamically imported module/i.test(`${error.name} ${error.message}`);
    return (
      <div role="alert" style={{ maxWidth: 520, margin: '15vh auto', padding: 16, fontFamily: 'system-ui, sans-serif', lineHeight: 1.5 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Something went wrong</h1>
        <p>{chunk
          ? 'Part of the app could not be loaded, probably because a new version was just published.'
          : 'The page ran into an error.'} Reloading usually fixes it.</p>
        <p style={{ marginTop: 12 }}>
          <button type="button" onClick={() => window.location.reload()}
            style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid currentColor', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
            Reload
          </button>
        </p>
        <p style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>{error.message}</p>
      </div>
    );
  }
}
