import React from 'react';
import { createPortal } from 'react-dom';
import { FileText, Loader2, Printer } from 'lucide-react';
import { Button } from '../ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/Dialog';
import { fetchAerodrome, fetchPointInfo } from '../../api/backend';
import type { AerodromeInfo } from '../../types/route';
import { track } from '../../lib/analytics';
import BriefingPack, { type AirportFrequencies, BRIEFING_SECTIONS, type BriefingData, type BriefingSection } from './BriefingPack';

/** The sections left out (so a section added later starts ticked); v2 since the pages were rearranged. */
const OFF_KEY = 'briefingSectionsOff.v2';
const ALL: BriefingSection[] = BRIEFING_SECTIONS.map(s => s.id);
/** print() taking longer than this waited for its dialog (Chrome, Firefox): the printing is over when it returns. */
const BLOCKING_PRINT_MS = 500;
/** After a print() that didn't wait (Safari), the pack stays until a tap or key from this long after. */
const BACK_AFTER_MS = 500;
/** Printed anyway if the maps take longer than this to load. */
const MAX_WAIT_MS = 20_000;

function loadSections(): BriefingSection[] {
  try {
    const off = JSON.parse(localStorage.getItem(OFF_KEY) ?? 'null');
    if (Array.isArray(off)) return ALL.filter(s => !off.includes(s));
  } catch {
    // Not saved yet.
  }
  return ALL;
}

type Given = Omit<BriefingData, 'airportFrequencies' | 'aerodromes'>;

/** The departure's and arrival's circuits and reporting points (none for a position or when openAIP can't say). */
async function aerodromesOf(data: Given): Promise<Record<string, AerodromeInfo>> {
  const ends = [data.trip.departure, data.trip.arrival].filter((a, i, all) => a.type !== 'point' && all.findIndex(b => b.code === a.code) === i);
  const out: Record<string, AerodromeInfo> = {};
  await Promise.all(ends.map(async a => {
    try {
      out[a.code] = await fetchAerodrome(a.code);
    } catch {
      // Left out: the pack says it isn't in the data.
    }
  }));
  return out;
}

/** Each airport on the route (not positions) with its frequencies, from the airspace lookup at it. */
async function airportFrequencies(data: Given): Promise<AirportFrequencies[]> {
  const { trip } = data;
  const airports = [trip.departure, ...(trip.waypoints ?? []), trip.arrival]
    .filter((a, i, all) => a.type !== 'point' && all.findIndex(b => b.code === a.code) === i);
  return Promise.all(airports.map(async a => {
    try {
      const info = await fetchPointInfo(a.lat, a.lon);
      const own = info.airports.find(x => x.code === a.code);
      return { code: a.code, name: a.name, frequencies: own?.frequencies ?? [] };
    } catch {
      return { code: a.code, name: a.name, frequencies: [] };
    }
  }));
}

/** "Briefing pack": choose the sections, then print them on their own. */
const BriefingButton: React.FC<{ data: Given | null }> = ({ data }) => {
  const [open, setOpen] = React.useState(false);
  const [sections, setSections] = React.useState<BriefingSection[]>(loadSections);
  const [freqs, setFreqs] = React.useState<AirportFrequencies[] | null>(null);
  const [aerodromes, setAerodromes] = React.useState<Record<string, AerodromeInfo> | null>(null);
  const [printing, setPrinting] = React.useState(false);
  /** The print dialog has been asked for: no more "Preparing". */
  const [printed, setPrinted] = React.useState(false);
  const routeKey = data ? [data.trip.departure, ...(data.trip.waypoints ?? []), data.trip.arrival].map(a => a.code).join(',') : '';

  // The airport frequencies, circuits and reporting points, looked up when the dialog opens.
  React.useEffect(() => {
    if (!open || !data) return;
    let live = true;
    setFreqs(null);
    setAerodromes(null);
    airportFrequencies(data).then(f => { if (live) setFreqs(f); });
    aerodromesOf(data).then(a => { if (live) setAerodromes(a); });
    return () => { live = false; };
  }, [open, routeKey]);

  // Print only the pack, in light colours; put the page back afterwards.
  React.useEffect(() => {
    if (!printing) return;
    const html = document.documentElement;
    const dark = html.classList.contains('dark');
    html.classList.remove('dark');
    document.body.classList.add('print-briefing');
    const done = () => setPrinting(false);
    // Not on afterprint: Safari fires it before it has printed anything, and would print the page underneath.
    let later = 0;
    // Once the pack has laid out and every map has its tiles (or it's taken too long).
    const started = Date.now();
    let t = 0;
    const check = () => {
      const waiting = document.querySelector('.briefing-pack [data-map-ready="false"]');
      if (waiting && Date.now() - started < MAX_WAIT_MS) {
        t = window.setTimeout(check, 200);
        return;
      }
      const asked = Date.now();
      window.print();
      setPrinted(true);
      // A browser that waits in print() until its dialog is closed: done.
      if (Date.now() - asked > BLOCKING_PRINT_MS) {
        done();
        return;
      }
      // One that doesn't (Safari) prints later: keep the pack until the pilot is back on the page.
      later = window.setTimeout(() => {
        window.addEventListener('pointerdown', done, { once: true });
        window.addEventListener('keydown', done, { once: true });
      }, BACK_AFTER_MS);
    };
    t = window.setTimeout(check, 100);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(later);
      window.removeEventListener('pointerdown', done);
      window.removeEventListener('keydown', done);
      document.body.classList.remove('print-briefing');
      if (dark) html.classList.add('dark');
      setPrinted(false);
    };
  }, [printing]);

  const toggle = (s: BriefingSection) => {
    const next = sections.includes(s) ? sections.filter(x => x !== s) : ALL.filter(x => x === s || sections.includes(x));
    setSections(next);
    try { localStorage.setItem(OFF_KEY, JSON.stringify(ALL.filter(x => !next.includes(x)))); } catch { /* private mode */ }
  };
  const waiting = sections.includes('airfields') && (freqs === null || aerodromes === null);

  return (
    <>
      <Button type="button" variant="outline" className="print:hidden" disabled={!data} onClick={() => setOpen(true)}>
        <FileText className="mr-2 h-4 w-4"/> Briefing pack
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Print a briefing pack</DialogTitle>
            <DialogDescription>{data ? `${data.routeName} in ${data.aircraftName}. Choose what to include.` : 'Plan a route first.'}</DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-2">
            <legend className="sr-only">Sections</legend>
            {BRIEFING_SECTIONS.map(s => (
              <label key={s.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={sections.includes(s.id)} onChange={() => toggle(s.id)}/>
                <span>
                  <span className="font-medium">{s.label}</span>
                  <span className="block text-xs text-muted-foreground">{s.detail}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-muted-foreground">
            The emergency checklist is generic for a single-engine piston aeroplane, with this aircraft&apos;s speeds: your POH/AFM
            takes precedence. With maps, printing starts once they have loaded.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" disabled={!data || sections.length === 0 || waiting}
              onClick={() => { track('briefing-print'); setOpen(false); setPrinting(true); }}>
              {waiting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Printer className="mr-2 h-4 w-4"/>}
              {waiting ? 'Looking up frequencies and reporting points…' : 'Print'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {printing && !printed && (
        <p role="status" className="fixed inset-x-0 top-4 z-[60] mx-auto flex w-fit items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm shadow-lg print:hidden">
          <Loader2 className="h-4 w-4 animate-spin"/> Preparing the briefing pack…
        </p>
      )}
      {printing && data && createPortal(
        <div className="briefing-pack"><BriefingPack data={{ ...data, airportFrequencies: freqs, aerodromes }} sections={sections}/></div>,
        document.body,
      )}
    </>
  );
};

export default BriefingButton;
