import React from 'react';
import { AlertTriangle, CheckCircle2, History, Loader2, Pencil, Plane, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/Dialog';
import { AircraftWizard, type WizardMode } from '../import/AddAircraftPage';
import { listClubAircraft, listClubAircraftChanges, removeClubAircraft } from '../../api/backend';
import type { AdminAccess, ClubOption } from '../../types/admin';
import type { ChangeView, ClubAircraft } from '../../types/clubAircraft';

const selectClass = 'h-10 rounded-md border border-gray-300 bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500';

const fmt = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 3 });

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function pilots(n: number): string {
  return `${n} pilot${n === 1 ? '' : 's'}`;
}

const ChangeLine: React.FC<{ change: ChangeView }> = ({ change }) => (
  <span>
    {change.summary}
    <span className="text-muted-foreground"> · {change.changedBy ?? 'a deleted account'}, {when(change.changedAt)}</span>
  </span>
);

const AircraftRow: React.FC<{
  aircraft: ClubAircraft; onEdit: () => void; onRemove: () => void;
}> = ({ aircraft: a, onEdit, onRemove }) => (
  <li className="flex flex-wrap items-start justify-between gap-3 py-3">
    <div className="min-w-0 space-y-0.5">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{a.registration}</span>
        <span className="text-sm text-muted-foreground">{a.spec.name}</span>
        {a.typeStatus === 'AI_SUGGESTED' && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
            AI-suggested values
          </span>
        )}
      </p>
      <p className="text-sm">
        Empty {fmt(a.emptyWeightKg)} kg at {fmt(a.emptyArmM)} m · MTOW {fmt(a.spec.mtow)} kg
        {a.weighedOn && <> · weighed {a.weighedOn}</>}
        {a.weighings > 1 && <span className="text-muted-foreground"> ({a.weighings} weighings on record)</span>}
      </p>
      <p className="text-xs text-muted-foreground">Shown by {pilots(a.shownToPilots)}</p>
      {a.lastChange && <p className="text-xs"><ChangeLine change={a.lastChange} /></p>}
    </div>
    <div className="flex gap-1">
      <Button size="sm" variant="outline" onClick={onEdit} aria-label={`Edit ${a.registration}`}>
        <Pencil className="h-4 w-4 sm:mr-1" /><span className="sr-only sm:not-sr-only">Edit</span>
      </Button>
      <Button size="sm" variant="ghost" onClick={onRemove} aria-label={`Remove ${a.registration}`}
        className="text-red-700 hover:text-red-800 dark:text-red-400">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  </li>
);

/**
 * A club's aircraft for its admins: add (through the same checks as a pilot's own import), edit
 * (showing exactly what changes for pilots), remove, and the log of every change.
 */
const ClubAircraftAdmin: React.FC<{ access: AdminAccess }> = ({ access }) => {
  const [clubId, setClubId] = React.useState<number | null>(access.clubs[0]?.id ?? null);
  const club: ClubOption | undefined = access.clubs.find(c => c.id === clubId);
  const [aircraft, setAircraft] = React.useState<ClubAircraft[] | null>(null);
  const [changes, setChanges] = React.useState<ChangeView[]>([]);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [wizard, setWizard] = React.useState<WizardMode | null>(null);
  const [removing, setRemoving] = React.useState<ClubAircraft | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (clubId === null) return;
    let cancelled = false;
    setAircraft(null);
    Promise.all([listClubAircraft(clubId), listClubAircraftChanges(clubId)])
      .then(([list, log]) => {
        if (cancelled) return;
        setAircraft(list);
        setChanges(log);
      })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the aircraft.'); });
    return () => { cancelled = true; };
  }, [clubId, reloadKey]);

  if (!club) {
    return <p className="py-6 text-sm text-muted-foreground">You don&apos;t administer any club.</p>;
  }

  if (wizard) {
    const close = (saved: boolean) => {
      setWizard(null);
      if (saved) setReloadKey(k => k + 1);
    };
    return (
      <AircraftWizard
        key={wizard.kind === 'clubEdit' ? `edit-${wizard.aircraft.id}` : 'add'}
        mode={wizard}
        onCancel={() => close(false)}
        onDone={() => close(true)}
      />
    );
  }

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    setError(null);
    try {
      await removeClubAircraft(club.id, removing.id);
      setNotice(`${removing.registration} was removed from ${club.name}.`);
      setRemoving(null);
      setReloadKey(k => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the aircraft.');
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Plane className="h-5 w-5 -rotate-45 text-blue-600" />
              Club aircraft
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {access.clubs.length > 1 && (
                <select aria-label="Club" value={club.id} className={selectClass}
                  onChange={e => { setClubId(Number(e.target.value)); setNotice(null); setError(null); }}>
                  {access.clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <Button size="sm" onClick={() => { setNotice(null); setWizard({ kind: 'clubAdd', club }); }}>
                <Plus className="mr-1 h-4 w-4" />
                Add aircraft
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Pilots plan with these values. Every change is checked against the model&apos;s standard and logged below.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div aria-live="polite">
            {notice && (
              <p role="status" className="flex items-start gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-900 dark:bg-green-900/30 dark:text-green-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                {notice}
              </p>
            )}
            {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{error}</p>}
          </div>
          {!aircraft ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading aircraft…</p>
          ) : aircraft.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">{club.name} has no aircraft yet.</p>
          ) : (
            <ul className="divide-y divide-border" aria-label={`${club.name} aircraft`}>
              {aircraft.map(a => (
                <AircraftRow key={a.id} aircraft={a}
                  onEdit={() => { setNotice(null); setWizard({ kind: 'clubEdit', club, aircraft: a }); }}
                  onRemove={() => setRemoving(a)} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {changes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" />
              Changes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm" aria-label="Aircraft changes">
              {changes.map(c => <li key={c.id}><ChangeLine change={c} /></li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      <Dialog open={removing !== null} onOpenChange={open => { if (!open) setRemoving(null); }}>
        <DialogContent className="sm:max-w-md">
          {removing && (
            <>
              <DialogHeader>
                <DialogTitle>Remove {removing.registration}?</DialogTitle>
                <DialogDescription>
                  It disappears from the calculator for everyone
                  {removing.shownToPilots > 0 ? `, including the ${pilots(removing.shownToPilots)} who show it now` : ''}.
                  The change log keeps a copy of its values.
                </DialogDescription>
              </DialogHeader>
              {removing.shownToPilots > 0 && (
                <p className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  If the aircraft only needs new values, edit it instead.
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setRemoving(null)} disabled={busy}>Cancel</Button>
                <Button variant="destructive" onClick={remove} disabled={busy}>
                  {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Remove
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClubAircraftAdmin;
