import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import NumField from './NumField';
import { cloneSpec, STATION_LABELS } from '../../lib/aircraftSpec';
import type { AircraftSpec, SpeedUnit } from '../../types/airframeImport';

interface AircraftValuesFormProps {
  spec: AircraftSpec;
  onChange: (spec: AircraftSpec) => void;
}

// The calculator always uses these.
const REQUIRED_STATIONS = ['pilotFront', 'baggage', 'fuel'];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-4">
      <legend className="px-1 font-semibold">{title}</legend>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {children}
    </fieldset>
  );
}

/** Editable type-level values: limits, envelope, stations and performance. */
const AircraftValuesForm: React.FC<AircraftValuesFormProps> = ({ spec, onChange }) => {
  const edit = (mutate: (draft: AircraftSpec) => void) => {
    const draft = cloneSpec(spec);
    mutate(draft);
    onChange(draft);
  };
  // Empty fields are sent as null; the backend reports them as validation errors.
  const num = (v: number | null) => v as number;
  const p = spec.performance;
  const unit = p.speedUnit === 'MPH' ? 'mph' : 'kt';

  return (
    <div className="space-y-5">
      <Section title="Weight & CG limits">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <NumField id="mtow" label="MTOW" unit="kg" required value={spec.mtow}
            onChange={v => edit(d => { d.mtow = num(v); })} />
          <NumField id="env-max" label="Envelope max weight" unit="kg" required value={spec.envelope.limits.maxWeight}
            onChange={v => edit(d => { d.envelope.limits.maxWeight = num(v); })} />
          <NumField id="env-min" label="Envelope min weight" unit="kg" required value={spec.envelope.limits.minWeight}
            onChange={v => edit(d => { d.envelope.limits.minWeight = num(v); })} />
          <NumField id="fwd-cg" label="Forward CG limit" unit="m" required value={spec.envelope.limits.forwardCG}
            onChange={v => edit(d => { d.envelope.limits.forwardCG = num(v); })} />
          <NumField id="aft-cg" label="Aft CG limit" unit="m" required value={spec.envelope.limits.aftCG}
            onChange={v => edit(d => { d.envelope.limits.aftCG = num(v); })} />
        </div>
      </Section>

      <Section title="CG envelope" hint="Corner points in drawing order. Metres aft of datum and kilograms.">
        <table className="w-full max-w-md text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr><th className="pb-1 font-medium">#</th><th className="pb-1 font-medium">CG (m)</th><th className="pb-1 font-medium">Weight (kg)</th><th /></tr>
          </thead>
          <tbody>
            {spec.envelope.points.map((pt, i) => (
              <tr key={i}>
                <td className="pr-2 text-muted-foreground">{i + 1}</td>
                <td className="py-1 pr-2">
                  <NumField id={`pt-${i}-cg`} ariaLabel={`Point ${i + 1} CG`} value={pt.cg}
                    onChange={v => edit(d => { d.envelope.points[i].cg = num(v); })} />
                </td>
                <td className="py-1 pr-2">
                  <NumField id={`pt-${i}-w`} ariaLabel={`Point ${i + 1} weight`} value={pt.weight}
                    onChange={v => edit(d => { d.envelope.points[i].weight = num(v); })} />
                </td>
                <td>
                  <Button variant="ghost" size="icon" aria-label={`Remove point ${i + 1}`}
                    disabled={spec.envelope.points.length <= 3}
                    onClick={() => edit(d => { d.envelope.points.splice(i, 1); })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button variant="outline" size="sm" onClick={() => edit(d => {
          const last = d.envelope.points[d.envelope.points.length - 1];
          d.envelope.points.push({ ...last });
        })}>
          <Plus className="mr-1 h-4 w-4" /> Add point
        </Button>
      </Section>

      <Section title="Loading stations">
        {Object.keys(STATION_LABELS).map(code => {
          const s = spec.stations[code];
          const isFuel = code === 'fuel';
          const required = REQUIRED_STATIONS.includes(code);
          return (
            <div key={code} className="rounded-md border border-border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={!!s} disabled={required}
                  onChange={e => edit(d => {
                    if (e.target.checked) {
                      d.stations[code] = isFuel
                        ? { arm: 0, maxLiters: 0, standardLiters: 0, weightPerLiter: 0.72 }
                        : { arm: 0, maxWeight: 0 };
                    } else {
                      delete d.stations[code];
                    }
                  })} />
                {STATION_LABELS[code]}
              </label>
              {s && (
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <NumField id={`${code}-arm`} label="Arm" unit="m" required value={s.arm}
                    onChange={v => edit(d => { d.stations[code].arm = num(v); })} />
                  {isFuel ? (
                    <>
                      <NumField id="fuel-max" label="Usable fuel" unit="L" required value={s.maxLiters}
                        onChange={v => edit(d => { d.stations.fuel.maxLiters = v; })} />
                      <NumField id="fuel-std" label="Standard fill" unit="L" required value={s.standardLiters}
                        onChange={v => edit(d => { d.stations.fuel.standardLiters = v; })} />
                      <NumField id="fuel-density" label="Density" unit="kg/L" required value={s.weightPerLiter}
                        onChange={v => edit(d => { d.stations.fuel.weightPerLiter = v; })} />
                    </>
                  ) : (
                    <NumField id={`${code}-max`} label="Max load" unit="kg" required value={s.maxWeight}
                      onChange={v => edit(d => { d.stations[code].maxWeight = v; })} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </Section>

      <Section title="Performance">
        <div className="space-y-1">
          <label htmlFor="speed-unit" className="text-sm font-medium">Speed unit</label>
          <select id="speed-unit" value={p.speedUnit}
            className="block h-10 rounded-md border border-gray-300 bg-background px-3 text-sm"
            onChange={e => edit(d => {
              const u = e.target.value as SpeedUnit;
              d.performance.speedUnit = u;
              d.performance.fuelConsumption.forEach(f => { f.speedUnit = u; });
            })}>
            <option value="KIAS">Knots (KIAS)</option>
            <option value="MPH">Miles per hour</option>
          </select>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NumField id="xwind" label="Max demo crosswind" unit={unit} required value={p.maxDemoCrosswind}
            onChange={v => edit(d => { d.performance.maxDemoCrosswind = num(v); })} />
          <NumField id="vs1" label="Stall speed clean" unit={unit} required value={p.stallSpeedClean}
            onChange={v => edit(d => { d.performance.stallSpeedClean = num(v); })} />
          <NumField id="vs0" label="Stall speed landing" unit={unit} required value={p.stallSpeedLanding}
            onChange={v => edit(d => { d.performance.stallSpeedLanding = num(v); })} />
          <NumField id="vy" label="Best climb" unit={unit} required value={p.bestClimbSpeed}
            onChange={v => edit(d => { d.performance.bestClimbSpeed = num(v); })} />
          <NumField id="vg" label="Best glide" unit={unit} value={p.bestGlideSpeed}
            onChange={v => edit(d => { d.performance.bestGlideSpeed = v; })} />
          <NumField id="vapp" label="Normal approach" unit={unit} required value={p.approachSpeedNormal}
            onChange={v => edit(d => { d.performance.approachSpeedNormal = num(v); })} />
          <NumField id="vcruise" label="Cruise" unit={unit} value={p.cruiseSpeed}
            onChange={v => edit(d => { d.performance.cruiseSpeed = v; })} />
        </div>

        <table className="w-full max-w-lg text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr><th className="pb-1 font-medium">Power</th><th className="pb-1 font-medium">Fuel flow (L/h)</th><th className="pb-1 font-medium">Speed ({unit})</th></tr>
          </thead>
          <tbody>
            {p.fuelConsumption.map((f, i) => (
              <tr key={f.powerSetting}>
                <td className="pr-2">{f.powerSetting}</td>
                <td className="py-1 pr-2">
                  <NumField id={`ff-${i}`} ariaLabel={`${f.powerSetting} fuel flow`} value={f.litersPerHour}
                    onChange={v => edit(d => { d.performance.fuelConsumption[i].litersPerHour = num(v); })} />
                </td>
                <td className="py-1">
                  <NumField id={`fs-${i}`} ariaLabel={`${f.powerSetting} speed`} value={f.speed}
                    onChange={v => edit(d => { d.performance.fuelConsumption[i].speed = num(v); })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NumField id="taxi-l" label="Taxi fuel" unit="L" required value={p.taxiFuel.liters}
            onChange={v => edit(d => { d.performance.taxiFuel.liters = num(v); })} />
          <NumField id="taxi-min" label="Taxi time" unit="min" required value={p.taxiFuel.timeMinutes}
            onChange={v => edit(d => { d.performance.taxiFuel.timeMinutes = num(v); })} />
          <NumField id="res-min" label="Minimum reserve" unit="min" required value={p.reserveFuel.minimumMinutes}
            onChange={v => edit(d => { d.performance.reserveFuel.minimumMinutes = num(v); })} />
          <NumField id="res-l" label="Recommended reserve" unit="L" required value={p.reserveFuel.recommendedLiters}
            onChange={v => edit(d => { d.performance.reserveFuel.recommendedLiters = num(v); })} />
        </div>
      </Section>
    </div>
  );
};

export default AircraftValuesForm;
