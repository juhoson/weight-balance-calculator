import React from 'react';
import { Loader2, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/Dialog';
import { Button } from './ui/Button';
import SignInButton from './auth/SignInButton';
import { fetchClubs, saveClubSelection } from '../api/backend';
import { useAuth } from '../api/useAuth';
import type { ClubSelectionRequest, ClubView } from '../types/airframeImport';

/** Per club: all aircraft (including ones added later), or the ids picked one by one. */
type Choice = { all: boolean; picked: Set<number> };

function choicesFrom(clubs: ClubView[]): Record<number, Choice> {
  const out: Record<number, Choice> = {};
  for (const c of clubs) {
    out[c.id] = {
      all: c.allAircraft,
      picked: new Set(c.allAircraft ? [] : c.aircraft.filter(a => a.selected).map(a => a.id)),
    };
  }
  return out;
}

export function toRequest(choices: Record<number, Choice>): ClubSelectionRequest {
  return {
    clubs: Object.entries(choices)
      .filter(([, c]) => c.all || c.picked.size > 0)
      .map(([id, c]) => ({ clubId: Number(id), allAircraft: c.all, airframeIds: c.all ? [] : Array.from(c.picked) })),
  };
}

interface ClubAircraftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After a successful save, so the calculator can reload its list. */
  onSaved: () => void;
}

/** Choose which clubs' aircraft - all, or only some - appear in the calculator. */
export const ClubAircraftDialog: React.FC<ClubAircraftDialogProps> = ({ open, onOpenChange, onSaved }) => {
  const [clubs, setClubs] = React.useState<ClubView[] | null>(null);
  const [choices, setChoices] = React.useState<Record<number, Choice>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setClubs(null);
    setError(null);
    fetchClubs()
      .then(list => {
        if (cancelled) return;
        setClubs(list);
        setChoices(choicesFrom(list));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the clubs.');
      });
    return () => { cancelled = true; };
  }, [open]);

  const setAll = (clubId: number, all: boolean) =>
    setChoices(prev => ({ ...prev, [clubId]: { all, picked: new Set() } }));

  const toggle = (club: ClubView, airframeId: number) =>
    setChoices(prev => {
      const current = prev[club.id];
      // Unticking one aircraft while "all" is on leaves the others picked.
      const picked = current.all ? new Set(club.aircraft.map(a => a.id)) : new Set(current.picked);
      if (picked.has(airframeId)) picked.delete(airframeId); else picked.add(airframeId);
      return { ...prev, [club.id]: { all: false, picked } };
    });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await saveClubSelection(toRequest(choices));
      setClubs(updated);
      setChoices(choicesFrom(updated));
      onSaved();
      onOpenChange(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save your choice.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Club aircraft</DialogTitle>
          <DialogDescription>
            Choose the clubs whose aircraft you fly. Pick all of a club&apos;s aircraft (aircraft it adds later appear
            too) or only some.
          </DialogDescription>
        </DialogHeader>

        {!clubs && !error && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin"/> Loading clubs…
          </p>
        )}
        {clubs && clubs.length === 0 && (
          <p className="text-sm text-muted-foreground">No clubs have been set up yet.</p>
        )}
        {clubs && clubs.length > 0 && (
          <div className="space-y-4">
            {clubs.map(club => {
              const choice = choices[club.id] ?? { all: false, picked: new Set<number>() };
              return (
                <fieldset key={club.id} className="rounded-md border border-border p-3">
                  <legend className="px-1 text-sm font-semibold">{club.name}</legend>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={choice.all}
                      onChange={e => setAll(club.id, e.target.checked)}
                      disabled={club.aircraft.length === 0}
                    />
                    All aircraft
                  </label>
                  {club.aircraft.length === 0
                    ? <p className="mt-1 text-xs text-muted-foreground">No aircraft yet.</p>
                    : (
                      <ul className="mt-2 grid gap-1 pl-6 sm:grid-cols-2">
                        {club.aircraft.map(a => (
                          <li key={a.id}>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={choice.all || choice.picked.has(a.id)}
                                onChange={() => toggle(club, a.id)}
                              />
                              <span>
                                {a.registration}
                                <span className="text-muted-foreground"> · {a.code}</span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                </fieldset>
              );
            })}
          </div>
        )}

        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={save} disabled={busy || !clubs}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin"/>}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Next to the aircraft list: choose club aircraft when signed in, or sign in to do so. */
const ClubAircraftButton: React.FC<{ onSaved: () => void }> = ({ onSaved }) => {
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);
  if (!user) {
    return (
      <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        Flying a club aircraft?
        <SignInButton variant="link" size="sm" className="h-auto p-0 text-xs" label="Sign in to show your club's aircraft"/>
      </p>
    );
  }
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Users className="mr-1 h-4 w-4"/>
        Choose club aircraft
      </Button>
      <ClubAircraftDialog open={open} onOpenChange={setOpen} onSaved={onSaved}/>
    </>
  );
};

export default ClubAircraftButton;
