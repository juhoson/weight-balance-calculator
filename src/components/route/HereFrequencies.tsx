import React from 'react';
import { Loader2, LocateFixed, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { fetchPointInfo } from '../../api/backend';
import { classGHint, containsAltitude, contactFrequencies, frequencyText, uncontrolledBelow } from '../../lib/frequencies';
import { distanceNm } from '../../lib/openMeteo';
import type { PointInfo } from '../../types/route';

const FT_PER_M = 3.28084;
/** Ask again once the position has moved this far. */
const REFRESH_NM = 1;

type State =
  | { phase: 'off' }
  | { phase: 'locating' }
  | { phase: 'ready'; info: PointInfo; altitudeFt: number | null; at: Date }
  | { phase: 'error'; message: string };

/**
 * The airspaces and frequencies where the device is, following it while on: what to call at this
 * spot, lowest airspace first, with the nearest airports' frequencies.
 */
const HereFrequencies: React.FC = () => {
  const [state, setState] = React.useState<State>({ phase: 'off' });
  const watch = React.useRef<number | null>(null);
  const last = React.useRef<{ lat: number; lon: number } | null>(null);

  const stop = React.useCallback(() => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    last.current = null;
  }, []);
  React.useEffect(() => stop, [stop]);

  const start = () => {
    if (!navigator.geolocation) {
      setState({ phase: 'error', message: 'This browser can\'t tell where you are.' });
      return;
    }
    setState({ phase: 'locating' });
    watch.current = navigator.geolocation.watchPosition(
      pos => {
        const { latitude: lat, longitude: lon, altitude } = pos.coords;
        const altitudeFt = altitude === null || altitude === undefined ? null : Math.round(altitude * FT_PER_M);
        const moved = !last.current || distanceNm(last.current.lat, last.current.lon, lat, lon) >= REFRESH_NM;
        if (!moved) {
          setState(s => (s.phase === 'ready' ? { ...s, altitudeFt, at: new Date() } : s));
          return;
        }
        last.current = { lat, lon };
        fetchPointInfo(lat, lon)
          .then(info => { if (watch.current !== null) setState({ phase: 'ready', info, altitudeFt, at: new Date() }); })
          .catch(() => {
            last.current = null;
            if (watch.current !== null) setState({ phase: 'error', message: 'Could not load the airspace here. It will try again as you move.' });
          });
      },
      err => {
        stop();
        setState({ phase: 'error', message: err.code === err.PERMISSION_DENIED
          ? 'Location is blocked for this site. Allow it in the browser settings to see the frequency where you are.'
          : 'Could not get your position.' });
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
    );
  };

  if (state.phase === 'off' || (state.phase === 'error' && watch.current === null)) {
    return (
      <div className="space-y-1">
        <Button type="button" variant="outline" size="sm" onClick={start}>
          <LocateFixed className="mr-1 h-4 w-4"/> Frequencies where I am
        </Button>
        {state.phase === 'error' && <p className="text-xs text-red-600" role="alert">{state.message}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/40 p-2 text-xs" role="region" aria-label="Frequencies where you are">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-sm">Where you are</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => { stop(); setState({ phase: 'off' }); }}>
          <X className="mr-1 h-3.5 w-3.5"/> Stop
        </Button>
      </div>
      {state.phase === 'locating' && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/> Finding your position…</p>}
      {state.phase === 'error' && <p className="text-amber-700 dark:text-amber-300">{state.message}</p>}
      {state.phase === 'ready' && <Here info={state.info} altitudeFt={state.altitudeFt} at={state.at}/>}
    </div>
  );
};

const Here: React.FC<{ info: PointInfo; altitudeFt: number | null; at: Date }> = ({ info, altitudeFt, at }) => {
  const shown = info.airspaces.filter(a => a.lower.ft < 19500 || a.lower.datum === 'GND');
  return (
    <>
      <p className="tabular-nums text-muted-foreground">
        {info.lat.toFixed(3)}°, {info.lon.toFixed(3)}°{altitudeFt !== null ? ` · GPS altitude ≈ ${altitudeFt.toLocaleString('en')} ft` : ''}
        {' '}· {at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </p>
      {shown.length === 0
        ? <p>No airspace listed here: uncontrolled (class G). {classGHint(info)}</p>
        : (
          <ul className="space-y-1">
            {shown.map(a => {
              const here = altitudeFt !== null && containsAltitude(a, altitudeFt);
              const freqs = contactFrequencies(a.frequencies);
              return (
                <li key={a.id} className={`rounded border px-2 py-1 ${here ? 'border-primary bg-primary/10' : 'border-border'}`}>
                  <p className="flex flex-wrap justify-between gap-x-2">
                    <span className="font-medium">{a.name}{here ? ' · you are in it' : ''}</span>
                    <span className="tabular-nums text-muted-foreground">{a.lower.label} – {a.upper.label}</span>
                  </p>
                  {freqs.length
                    ? freqs.map(f => (
                      <p key={f.value} className="font-semibold tabular-nums">{frequencyText(f)}
                        {f.source && <span className="font-normal text-muted-foreground"> (from {f.source})</span>}</p>
                    ))
                    : <p className="text-muted-foreground">No frequency listed</p>}
                </li>
              );
            })}
          </ul>
        )}
      {uncontrolledBelow(info.airspaces) && (
        <p>Below {uncontrolledBelow(info.airspaces)}: no airspace listed, uncontrolled (class G). {classGHint(info)}</p>
      )}
      {info.airports.length > 0 && (
        <div>
          <p className="font-medium">Nearest airports</p>
          <ul className="tabular-nums text-muted-foreground">
            {info.airports.slice(0, 3).map(ap => (
              <li key={ap.code}>{ap.code} {ap.distanceNm.toFixed(0)} NM: {contactFrequencies(ap.frequencies).slice(0, 2).map(frequencyText).join(', ') || '–'}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        GPS altitude is not pressure altitude and can be off by a few hundred feet. Frequencies from openAIP, Sweden Control sectors from the AIP (ENR 6.1); check the chart.
      </p>
    </>
  );
};

export default HereFrequencies;
