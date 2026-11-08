import React from 'react';
import { Bookmark, Check, Copy, Link2, Link2Off, Loader2, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { createRoute, deleteRoute, listRoutes, shareRoute, unshareRoute } from '../../api/backend';
import { fromAirports, type PlannedRoute, routeAirports, shareUrl } from '../../lib/route';
import type { SavedRoute } from '../../types/route';

interface Props {
  route: PlannedRoute;
  onLoad: (route: PlannedRoute) => void;
}

const chain = (codes: string[]) => codes.join(' → ');

/** Save the current route, and load, share or delete saved ones. Signed in only. */
export const SavedRoutesDialog: React.FC<Props & { open: boolean; onOpenChange: (open: boolean) => void }> = ({
  route, onLoad, open, onOpenChange,
}) => {
  const [routes, setRoutes] = React.useState<SavedRoute[] | null>(null);
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<number | null>(null);
  const current = routeAirports(route);
  const canSave = current.length >= 2;

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmDelete(null);
    setName(canSave ? chain(current) : '');
    let cancelled = false;
    listRoutes()
      .then(list => { if (!cancelled) setRoutes(list); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load your routes.'); });
    return () => { cancelled = true; };
    // Only when opened: the name suggestion uses the route at that moment.
  }, [open]);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };
  const replace = (r: SavedRoute) => setRoutes(prev => (prev ?? []).map(x => (x.id === r.id ? r : x)));

  const copy = async (r: SavedRoute) => {
    if (!r.shareToken) return;
    try {
      await navigator.clipboard.writeText(shareUrl(r.shareToken));
      setCopied(r.id);
      setTimeout(() => setCopied(c => (c === r.id ? null : c)), 2000);
    } catch {
      // Clipboard blocked: the link is shown and can be copied by hand.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Saved routes</DialogTitle>
          <DialogDescription>Save routes you fly often. Share one by link - anyone with it can open the route.</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-2 rounded-lg border border-border p-3"
          onSubmit={e => {
            e.preventDefault();
            if (!canSave || !name.trim()) return;
            run('save', async () => {
              const saved = await createRoute(name.trim(), current);
              setRoutes(prev => [...(prev ?? []), saved].sort((a, b) => a.name.localeCompare(b.name)));
            });
          }}
        >
          <label htmlFor="route-name" className="text-sm font-medium">Save the current route</label>
          <p className="text-xs text-muted-foreground">{canSave ? chain(current) : 'Choose a departure and an arrival first.'}</p>
          <div className="flex gap-2">
            <Input id="route-name" value={name} maxLength={100} onChange={e => setName(e.target.value)}
              placeholder="Name, e.g. Coffee flight to Skavsta" className="bg-background" disabled={!canSave}/>
            <Button type="submit" disabled={!canSave || !name.trim() || busy === 'save'}>
              {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin"/> : 'Save'}
            </Button>
          </div>
        </form>

        {routes === null && !error && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/> Loading…</p>
        )}
        {routes && routes.length === 0 && <p className="text-sm text-muted-foreground">No saved routes yet.</p>}
        {routes && routes.length > 0 && (
          <ul className="space-y-2">
            {routes.map(r => (
              <li key={r.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{r.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{chain(r.airports)}</p>
                  </div>
                  <Button type="button" size="sm" onClick={() => { onLoad(fromAirports(r.airports)); onOpenChange(false); }}>
                    Use
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {r.shareToken
                    ? (
                      <>
                        <Button type="button" variant="outline" size="sm" onClick={() => copy(r)}>
                          {copied === r.id ? <Check className="mr-1 h-4 w-4"/> : <Copy className="mr-1 h-4 w-4"/>}
                          {copied === r.id ? 'Copied' : 'Copy link'}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" disabled={busy === `unshare-${r.id}`}
                          onClick={() => run(`unshare-${r.id}`, async () => replace(await unshareRoute(r.id)))}>
                          <Link2Off className="mr-1 h-4 w-4"/> Stop sharing
                        </Button>
                      </>
                    )
                    : (
                      <Button type="button" variant="outline" size="sm" disabled={busy === `share-${r.id}`}
                        onClick={() => run(`share-${r.id}`, async () => {
                          const shared = await shareRoute(r.id);
                          replace(shared);
                          await copy(shared);
                        })}>
                        <Link2 className="mr-1 h-4 w-4"/> Share link
                      </Button>
                    )}
                  <span className="flex-1"/>
                  {confirmDelete === r.id
                    ? (
                      <Button type="button" variant="outline" size="sm" className="border-red-500 text-red-600"
                        disabled={busy === `delete-${r.id}`}
                        onClick={() => run(`delete-${r.id}`, async () => {
                          await deleteRoute(r.id);
                          setRoutes(prev => (prev ?? []).filter(x => x.id !== r.id));
                        })}>
                        Delete for good
                      </Button>
                    )
                    : (
                      <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${r.name}`} onClick={() => setConfirmDelete(r.id)}>
                        <Trash2 className="h-4 w-4"/>
                      </Button>
                    )}
                </div>
                {r.shareToken && (
                  <input readOnly value={shareUrl(r.shareToken)} aria-label={`Share link for ${r.name}`}
                    onFocus={e => e.target.select()}
                    className="mt-2 w-full rounded border border-border bg-muted/50 px-2 py-1 font-mono text-xs"/>
                )}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      </DialogContent>
    </Dialog>
  );
};

const SavedRoutesButton: React.FC<Props> = ({ route, onLoad }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Bookmark className="mr-1 h-4 w-4"/> Saved routes
      </Button>
      <SavedRoutesDialog route={route} onLoad={onLoad} open={open} onOpenChange={setOpen}/>
    </>
  );
};

export default SavedRoutesButton;
