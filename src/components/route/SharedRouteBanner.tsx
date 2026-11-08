import React from 'react';
import { Check, Loader2, Share2, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { createRoute, fetchSharedRoute } from '../../api/backend';
import { fromAirports, type PlannedRoute } from '../../lib/route';
import type { SharedRoute } from '../../types/route';

const PARAM = 'route';

/** Removes ?route= from the address bar so a reload doesn't show the banner again. */
function clearParam() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete(PARAM);
    window.history.replaceState(null, '', url.toString());
  } catch {
    // ignore
  }
}

interface Props {
  signedIn: boolean;
  onUse: (route: PlannedRoute) => void;
}

/** Shown when the page was opened from a share link (?route=token): use the route, or save a copy. */
const SharedRouteBanner: React.FC<Props> = ({ signedIn, onUse }) => {
  const [token] = React.useState(() => new URLSearchParams(window.location.search).get(PARAM));
  const [shared, setShared] = React.useState<SharedRoute | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (!token) return;
    fetchSharedRoute(token).then(setShared).catch((e: unknown) =>
      setError(e instanceof Error ? e.message : 'Could not open the shared route.'));
  }, [token]);

  if (!token || dismissed) return null;
  const close = () => { setDismissed(true); clearParam(); };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4" role="status">
      <Share2 className="h-5 w-5 shrink-0 text-primary"/>
      <div className="min-w-0 flex-1">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!error && !shared && <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin"/> Opening shared route…</p>}
        {shared && (
          <>
            <p className="text-sm font-semibold">{shared.name}</p>
            <p className="text-xs text-muted-foreground">{shared.airports.join(' → ')} · shared by {shared.sharedBy}</p>
          </>
        )}
      </div>
      {shared && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => { onUse(fromAirports(shared.airports)); close(); }}>Use this route</Button>
          {signedIn && (
            <Button type="button" variant="outline" size="sm" disabled={saving || saved}
              onClick={async () => {
                setSaving(true);
                try {
                  await createRoute(shared.name, shared.airports);
                  setSaved(true);
                } catch (e: unknown) {
                  setError(e instanceof Error ? e.message : 'Could not save the route.');
                } finally {
                  setSaving(false);
                }
              }}>
              {saved ? <><Check className="mr-1 h-4 w-4"/> Saved</> : saving ? <Loader2 className="h-4 w-4 animate-spin"/> : 'Save a copy'}
            </Button>
          )}
        </div>
      )}
      <Button type="button" variant="ghost" size="icon" aria-label="Dismiss" onClick={close}><X className="h-4 w-4"/></Button>
    </div>
  );
};

export default SharedRouteBanner;
