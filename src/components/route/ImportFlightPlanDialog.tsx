import React from 'react';
import { AlertTriangle, Check, ClipboardPaste, Loader2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { lookupAirports } from '../../api/backend';
import { parseFlightPlan } from '../../lib/flightPlan';
import type { PlannedRoute } from '../../lib/route';
import type { AirportInfo } from '../../types/route';

/** The backend takes at most this many waypoints. */
export const MAX_IMPORTED_WAYPOINTS = 18;

interface Preview {
  from: string;
  to: string;
  via: string[];
  /** From the pasted plan (false: kept from the current route). */
  fromPlan: { from: boolean; to: boolean };
  found: Map<string, AirportInfo>;
  missing: string[];
  skipped: { token: string; reason: string }[];
}

const EXAMPLE = 'ESSX DCT 5930N01700E DCT ESOW DCT ESSA';

interface Props {
  route: PlannedRoute;
  onImport: (route: PlannedRoute) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Paste an ICAO flight plan or its route; preview what was understood, then use it. */
export const ImportFlightPlanDialog: React.FC<Props> = ({ route, onImport, open, onOpenChange }) => {
  const [text, setText] = React.useState('');
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) { setText(''); setPreview(null); setError(null); }
  }, [open]);

  const read = async () => {
    setError(null);
    setPreview(null);
    const plan = parseFlightPlan(text);
    const from = plan.from ?? route.from;
    const to = plan.to ?? route.to;
    if (!from || !to) {
      setError('Could not tell the departure and destination. Start and end the route with airports (e.g. ESSX … ESSA), or set them first.');
      return;
    }
    setBusy(true);
    try {
      const codes = Array.from(new Set([from, ...plan.via, to]));
      const found = new Map((await lookupAirports(codes)).map(a => [a.code, a] as const));
      setPreview({
        from, to, via: plan.via, fromPlan: { from: !!plan.from, to: !!plan.to },
        found, missing: codes.filter(c => !found.has(c)), skipped: plan.skipped,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not look up the route.');
    } finally {
      setBusy(false);
    }
  };

  const usableVia = preview ? preview.via.filter(c => preview.found.has(c)) : [];
  const canUse = preview && preview.found.has(preview.from) && preview.found.has(preview.to)
    && usableVia.length <= MAX_IMPORTED_WAYPOINTS;

  const describe = (code: string) => {
    const a = preview?.found.get(code);
    if (!a) return <span className="text-red-700 dark:text-red-300">not found</span>;
    return <span className="text-muted-foreground">{a.type === 'point' ? `position ${a.name}` : a.name}</span>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import a flight plan</DialogTitle>
          <DialogDescription>
            Paste an ICAO flight plan, or just its route, e.g. <span className="font-mono">{EXAMPLE}</span>.
            SkyDemon and ForeFlight can copy the route in this form.
          </DialogDescription>
        </DialogHeader>

        <textarea value={text} onChange={e => { setText(e.target.value); setPreview(null); }} rows={5} spellCheck={false}
          aria-label="Flight plan or route" placeholder={`${EXAMPLE}\n\nor (FPL-SEABC-VG -C172/L-S/C -ESSX1200 -N0105VFR DCT … -ESSA0130 …)`}
          className="w-full rounded-lg border border-input bg-background p-2 font-mono text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"/>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {preview && (
          <div className="space-y-2 text-sm">
            <ol className="space-y-0.5" aria-label="Imported route">
              {[preview.from, ...preview.via, preview.to].map((code, i, all) => (
                <li key={`${code}-${i}`} className="flex items-baseline gap-2">
                  {preview.found.has(code)
                    ? <Check className="h-3.5 w-3.5 shrink-0 self-center text-emerald-600"/>
                    : <X className="h-3.5 w-3.5 shrink-0 self-center text-red-600"/>}
                  <span className="w-28 shrink-0 font-mono text-xs font-semibold">{code}</span>
                  <span className="min-w-0 truncate text-xs">
                    {describe(code)}
                    {i === 0 && !preview.fromPlan.from && ' (current departure)'}
                    {i === all.length - 1 && !preview.fromPlan.to && ' (current arrival)'}
                  </span>
                </li>
              ))}
            </ol>
            {preview.missing.length > 0 && (
              <p className="text-xs text-muted-foreground">Not found, left out: {preview.missing.join(', ')}.</p>
            )}
            {preview.skipped.length > 0 && (
              <div className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                <p className="flex items-center gap-1 font-medium"><AlertTriangle className="h-3.5 w-3.5"/> Left out - the leg is flown direct past them:</p>
                <ul className="mt-0.5 list-disc pl-5">
                  {preview.skipped.map((s, i) => <li key={i}><span className="font-mono">{s.token}</span>: {s.reason}</li>)}
                </ul>
                <p className="mt-1">Distances may come out short. Give such points as positions (5930N01700E) for an exact track.</p>
              </div>
            )}
            {usableVia.length > MAX_IMPORTED_WAYPOINTS && (
              <p className="text-xs text-red-600">At most {MAX_IMPORTED_WAYPOINTS} waypoints; this plan has {usableVia.length}.</p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          {!preview
            ? (
              <Button type="button" onClick={read} disabled={!text.trim() || busy}>
                {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin"/>} Read plan
              </Button>
            )
            : (
              <Button type="button" disabled={!canUse} onClick={() => {
                if (!preview) return;
                onImport({ from: preview.from, to: preview.to, via: usableVia, auto: false });
                onOpenChange(false);
              }}>
                Use this route
              </Button>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const ImportFlightPlanButton: React.FC<{ route: PlannedRoute; onImport: (route: PlannedRoute) => void }> = ({ route, onImport }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ClipboardPaste className="mr-1 h-4 w-4"/> Import flight plan
      </Button>
      <ImportFlightPlanDialog route={route} onImport={onImport} open={open} onOpenChange={setOpen}/>
    </>
  );
};

export default ImportFlightPlanButton;
