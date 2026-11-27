import React from 'react';
import { Download, History, Loader2, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { deleteTrack, downloadTrackKml, type FlightTrack, listTracks } from '../../api/backend';
import { hhmm, utcTime } from '../../lib/blockTimes';

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const duration = (a: string, b: string) => {
  const min = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
};

/** The flights the navigation mode saved, each downloadable as KML for Google Earth. Signed in only. */
const MyFlightsButton: React.FC = () => {
  const [open, setOpen] = React.useState(false);
  const [flights, setFlights] = React.useState<FlightTrack[] | null>(null);
  const [busy, setBusy] = React.useState<number | null>(null);
  const [confirm, setConfirm] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let live = true;
    setError(null);
    setConfirm(null);
    listTracks().then(f => { if (live) setFlights(f); }, e => { if (live) setError(e instanceof Error ? e.message : 'Could not load your flights.'); });
    return () => { live = false; };
  }, [open]);

  const act = async (id: number, f: () => Promise<void>) => {
    setBusy(id);
    setError(null);
    try { await f(); } catch (e) { setError(e instanceof Error ? e.message : 'That did not work.'); } finally { setBusy(null); }
  };

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <History className="mr-1 h-4 w-4"/> My flights
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>My flights</DialogTitle>
            <DialogDescription>Flights saved from navigation mode, with the times worked out from the GPS (UTC). Download one as KML to open it in Google Earth.</DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          {flights === null && !error && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/> Loading…</p>}
          {flights?.length === 0 && <p className="text-sm text-muted-foreground">No flights yet. End a flight in navigation mode to save it here.</p>}
          {flights && flights.length > 0 && (
            <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
              {flights.map(f => (
                <li key={f.id} className="flex items-center gap-2 py-2">
                  <div className="flex-1 text-sm">
                    <div className="font-medium">{f.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {when(f.startedAt)} · {duration(f.startedAt, f.endedAt)} · {Math.round(f.distanceNm)} NM
                    </div>
                    {f.times && (f.times.offBlock || f.times.takeoff) && (
                      <div className="text-xs tabular-nums text-muted-foreground" data-testid="flight-times">
                        Off {utcTime(f.times.offBlock)} · T/O {utcTime(f.times.takeoff)} · LDG {utcTime(f.times.landing)} · On {utcTime(f.times.onBlock)}
                        {hhmm(f.times.offBlock, f.times.onBlock) && <> · block <strong className="text-foreground">{hhmm(f.times.offBlock, f.times.onBlock)}</strong></>}
                        {hhmm(f.times.takeoff, f.times.landing) && <> · flight <strong className="text-foreground">{hhmm(f.times.takeoff, f.times.landing)}</strong></>}
                        {f.times.landings != null && ` · ${f.times.landings} ldg`}
                      </div>
                    )}
                  </div>
                  <Button type="button" variant="outline" size="sm" disabled={busy === f.id} aria-label={`Download ${f.name} as KML`}
                    onClick={() => act(f.id, () => downloadTrackKml(f.id))}>
                    {busy === f.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <Download className="mr-1 h-4 w-4"/>} KML
                  </Button>
                  {confirm === f.id ? (
                    <Button type="button" variant="destructive" size="sm" disabled={busy === f.id}
                      onClick={() => act(f.id, async () => { await deleteTrack(f.id); setFlights(l => (l ?? []).filter(x => x.id !== f.id)); })}>
                      Delete
                    </Button>
                  ) : (
                    <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${f.name}`} onClick={() => setConfirm(f.id)}>
                      <Trash2 className="h-4 w-4"/>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MyFlightsButton;
