import React from 'react';
import { Check, ClipboardCopy, FileText, Share2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Input } from '../ui/Input';
import { flightPlan, type FlightPlanInput, type FplPoint, storeFiledPlan, typeDesignator } from '../../lib/icaoFlightPlan';
import { saveFile } from '../../lib/share';
import { localInputValue } from '../route/EnroutePanel';
import { track } from '../../lib/analytics';

type Place = FlightPlanInput['departure'];

/** What the plan already knows; the pilot checks it and adds the rest. */
export interface FlightPlanDefaults {
  /** The aircraft's key: its type, equipment and colours are remembered for it. */
  aircraftKey: string;
  registration: string;
  /** The app's model code, for the ICAO type designator. */
  modelCode: string;
  departure: Place;
  destination: Place;
  via: FplPoint[];
  offBlock: Date;
  speedKt: number;
  levelFt: number;
  eetMinutes: number;
  fuelLiters: number;
  enduranceMinutes: number;
  personsOnBoard: number;
  pilot: string;
}

interface Remembered { aircraftType: string; wake: FlightPlanInput['wake']; equipment: string; colours: string }
const AIRCRAFT_KEY = (key: string) => `fpl.aircraft.v1.${key}`;
const CLOSE_PHONE_KEY = (code: string) => `fpl.closePhone.v1.${code}`;
const read = <T, >(key: string): T | null => { try { return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null; } catch { return null; } };
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ } };

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block text-sm">
    <span className="font-medium">{label}</span>
    {children}
    {hint && <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span>}
  </label>
);

const FlightPlanForm: React.FC<{ d: FlightPlanDefaults; onClose: () => void }> = ({ d, onClose }) => {
  const kept = read<Remembered>(AIRCRAFT_KEY(d.aircraftKey));
  const [callsign, setCallsign] = React.useState(d.registration.replace(/-/g, ''));
  const [aircraftType, setAircraftType] = React.useState(kept?.aircraftType || typeDesignator(d.modelCode));
  const [wake, setWake] = React.useState<FlightPlanInput['wake']>(kept?.wake ?? 'L');
  const [equipment, setEquipment] = React.useState(kept?.equipment ?? 'SY/C');
  const [colours, setColours] = React.useState(kept?.colours ?? '');
  const [offBlock, setOffBlock] = React.useState(localInputValue(d.offBlock));
  const [level, setLevel] = React.useState<'altitude' | 'VFR'>('altitude');
  const [levelFt, setLevelFt] = React.useState(d.levelFt);
  const [speedKt, setSpeedKt] = React.useState(d.speedKt);
  const [eetMinutes, setEetMinutes] = React.useState(d.eetMinutes);
  const [alternate, setAlternate] = React.useState('');
  const [fuelLiters, setFuelLiters] = React.useState(Math.round(d.fuelLiters));
  const [enduranceMinutes, setEnduranceMinutes] = React.useState(d.enduranceMinutes);
  const [personsOnBoard, setPersonsOnBoard] = React.useState(d.personsOnBoard);
  const [pilot, setPilot] = React.useState(d.pilot);
  const [remarks, setRemarks] = React.useState('');
  const [closePhone, setClosePhone] = React.useState(read<string>(CLOSE_PHONE_KEY(d.destination.code)) ?? '');
  const [copied, setCopied] = React.useState(false);
  const [filed, setFiled] = React.useState(false);

  const when = new Date(offBlock);
  const plan = flightPlan({
    callsign, aircraftType, wake, equipment, departure: d.departure, destination: d.destination, via: d.via,
    offBlock: Number.isNaN(when.getTime()) ? d.offBlock : when, speedKt, level: level === 'VFR' ? 'VFR' : levelFt,
    eetMinutes, alternate, remarks, enduranceMinutes, fuelLiters, personsOnBoard, colours, pilot,
  });
  const problems = [
    !/^[A-Z0-9]{2,7}$/.test(plan.items[0].value) ? 'Aircraft identification: the registration, 2–7 letters and digits.' : null,
    !/^[A-Z0-9]{2,4}$/i.test(aircraftType.trim()) ? 'Type of aircraft: the ICAO type designator (2–4 characters, e.g. P28A); ZZZZ with TYP/ in the remarks if it has none.' : null,
    enduranceMinutes <= eetMinutes ? 'The endurance is no longer than the flight: check the fuel.' : null,
  ].filter((p): p is string => !!p);
  const remember = () => write(AIRCRAFT_KEY(d.aircraftKey), { aircraftType, wake, equipment, colours } satisfies Remembered);
  const text = `${plan.message}\n\nItem 19: ${plan.supplementary}\n${plan.onBoard.map(o => `${o.label}: ${o.value}`).join('\n')}\n`;
  const copy = async () => {
    remember();
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch { /* not allowed: the text is on screen */ }
  };
  const markFiled = () => {
    remember();
    write(CLOSE_PHONE_KEY(d.destination.code), closePhone.trim());
    storeFiledPlan({ destination: d.destination.code, closePhone: closePhone.trim(), filedAt: Date.now() });
    track('flight-plan-filed');
    setFiled(true);
  };
  const input = 'mt-1 bg-background';

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Aircraft identification (7)"><Input className={input} value={callsign} onChange={e => setCallsign(e.target.value.toUpperCase())}/></Field>
        <Field label="Type (9)" hint="ICAO designator"><Input className={input} value={aircraftType} onChange={e => setAircraftType(e.target.value.toUpperCase())}/></Field>
        <Field label="Wake turbulence (9)">
          <select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2" value={wake} onChange={e => setWake(e.target.value as FlightPlanInput['wake'])}>
            <option value="L">L (light)</option><option value="M">M (medium)</option>
          </select>
        </Field>
        <Field label="Equipment / surveillance (10)" hint="e.g. SY/C: VHF radio, transponder mode C"><Input className={input} value={equipment} onChange={e => setEquipment(e.target.value.toUpperCase())}/></Field>
        <Field label="Off-block time (local)" hint={`${plan.items[4].value.slice(-4)} UTC in the plan`}>
          <Input className={input} type="datetime-local" value={offBlock} onChange={e => setOffBlock(e.target.value)}/>
        </Field>
        <Field label="Cruising speed (15)" hint="true airspeed, kt"><Input className={input} type="number" value={speedKt} onChange={e => setSpeedKt(Number(e.target.value) || 0)}/></Field>
        <Field label="Level (15)">
          <div className="mt-1 flex gap-2">
            <select className="h-10 rounded-md border border-input bg-background px-2" value={level} onChange={e => setLevel(e.target.value as 'altitude' | 'VFR')}>
              <option value="altitude">Altitude</option><option value="VFR">VFR</option>
            </select>
            {level === 'altitude' && <Input className="bg-background" type="number" step={500} value={levelFt} onChange={e => setLevelFt(Number(e.target.value) || 0)} aria-label="Altitude, ft"/>}
          </div>
        </Field>
        <Field label="Total EET (16)" hint="minutes"><Input className={input} type="number" value={eetMinutes} onChange={e => setEetMinutes(Number(e.target.value) || 0)}/></Field>
        <Field label="Alternate (16)" hint="optional"><Input className={input} value={alternate} onChange={e => setAlternate(e.target.value.toUpperCase())}/></Field>
        <Field label="Fuel on board" hint="litres"><Input className={input} type="number" value={fuelLiters} onChange={e => setFuelLiters(Number(e.target.value) || 0)}/></Field>
        <Field label="Endurance (19)" hint="minutes, at the cruise fuel flow"><Input className={input} type="number" value={enduranceMinutes} onChange={e => setEnduranceMinutes(Number(e.target.value) || 0)}/></Field>
        <Field label="Persons on board (19)"><Input className={input} type="number" min={1} value={personsOnBoard} onChange={e => setPersonsOnBoard(Math.max(1, Number(e.target.value) || 1))}/></Field>
        <Field label="Aircraft colours (19)"><Input className={input} value={colours} onChange={e => setColours(e.target.value)}/></Field>
        <Field label="Pilot in command (19)"><Input className={input} value={pilot} onChange={e => setPilot(e.target.value)}/></Field>
        <Field label="Remarks (18)" hint="optional"><Input className={input} value={remarks} onChange={e => setRemarks(e.target.value)}/></Field>
      </div>

      {problems.length > 0 && (
        <ul className="space-y-0.5 rounded-md border border-amber-500/40 bg-amber-50 p-2 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          {problems.map(p => <li key={p}>{p}</li>)}
        </ul>
      )}

      <section aria-label="The flight plan" className="space-y-2">
        <table className="w-full text-xs">
          <tbody>
            {plan.items.map(i => (
              <tr key={i.item} className="border-t border-border align-top">
                <th className="w-8 py-1 pr-2 text-left font-semibold">{i.item}</th>
                <td className="py-1 pr-2 text-muted-foreground">{i.label}</td>
                <td className="break-all py-1 font-mono">{i.value}</td>
              </tr>
            ))}
            <tr className="border-t border-border align-top">
              <th className="py-1 pr-2 text-left font-semibold">19</th>
              <td className="py-1 pr-2 text-muted-foreground">Supplementary information</td>
              <td className="break-all py-1 font-mono">{plan.supplementary}</td>
            </tr>
          </tbody>
        </table>
        <dl className="grid grid-cols-3 gap-2 rounded-md border border-border p-2 text-sm" aria-label="On board">
          {plan.onBoard.map(o => (
            <div key={o.label}><dt className="text-[11px] text-muted-foreground">{o.label}</dt><dd className="font-semibold tabular-nums">{o.value}</dd></div>
          ))}
        </dl>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-2 font-mono text-xs" aria-label="ATS message">{plan.message}</pre>
        <p className="text-[11px] text-muted-foreground">
          Item 15 takes only published points: reporting points, positions and airfields on the way are given as coordinates
          (named in RMK). Check every item before filing; you file it yourself.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={copy}>
            {copied ? <Check className="mr-1 h-4 w-4"/> : <ClipboardCopy className="mr-1 h-4 w-4"/>} {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => { remember(); void saveFile(`FPL-${plan.items[0].value}.txt`, text, 'text/plain'); }}>
            <Share2 className="mr-1 h-4 w-4"/> Save or share
          </Button>
          {d.departure.code.startsWith('ES') && (
            <a className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm underline-offset-2 hover:underline" href="https://aro.lfv.se/" target="_blank" rel="noreferrer">
              File on AROWeb (LFV)
            </a>
          )}
        </div>
      </section>

      <section aria-label="Closing the flight plan" className="space-y-2 rounded-md border border-border p-3">
        <Field label="Phone number to close the flight plan" hint={`For ${d.destination.code}: the number the AIP or the ATS reporting office gives. Remembered for this field. At a field with a tower, ATC closes it on landing.`}>
          <Input className={input} type="tel" value={closePhone} onChange={e => setClosePhone(e.target.value)}/>
        </Field>
        {filed
          ? <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">Marked as filed: navigation mode reminds you to close it after landing.</p>
          : <Button type="button" size="sm" variant="outline" onClick={markFiled}>I&apos;ve filed it: remind me to close it after landing</Button>}
      </section>

      <div className="flex justify-end"><Button type="button" variant="ghost" onClick={onClose}>Close</Button></div>
    </div>
  );
};

/** "ICAO flight plan": the plan's items and ATS message, ready for filing. */
const FlightPlanButton: React.FC<{ defaults: FlightPlanDefaults | null }> = ({ defaults }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={!defaults} onClick={() => { setOpen(true); track('flight-plan'); }}>
        <FileText className="mr-1 h-4 w-4"/> ICAO flight plan
      </Button>
      <Dialog open={open && !!defaults} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>ICAO flight plan</DialogTitle>
            <DialogDescription>VFR, from this plan: check it, add what it can&apos;t know, then copy it to your filing service.</DialogDescription>
          </DialogHeader>
          {defaults && <FlightPlanForm d={defaults} onClose={() => setOpen(false)}/>}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default FlightPlanButton;
