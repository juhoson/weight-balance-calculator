import React from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Alert, AlertDescription, AlertTitle } from '../ui/Alert';
import NumField from './NumField';
import AircraftValuesForm from './AircraftValuesForm';
import ImportReview from './ImportReview';
import { addClubAircraft, fetchStandard, previewClubAircraftEdit, previewImport, updateClubAircraft } from '../../api/backend';
import { useAuth } from '../../api/useAuth';
import SignInButton from '../auth/SignInButton';
import { aircraftData } from '../../data/aircraftData';
import { specFromAircraftData } from '../../lib/aircraftSpec';
import type {
  AircraftSpec,
  AirframeImportRequest,
  ImportPreviewResponse,
  ImportResult,
  StandardTypeResponse,
} from '../../types/airframeImport';
import type { ClubOption } from '../../types/admin';
import type { ClubAircraft, ValueChange } from '../../types/clubAircraft';

type Step = 'details' | 'values' | 'review' | 'done';
type StartFrom = 'current' | 'standard' | 'builtin';

interface Details {
  registration: string;
  code: string;
  name: string;
  emptyWeightKg: number | null;
  emptyArmM: number | null;
  weighedOn: string;
}

const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'details', label: 'Aircraft' },
  { id: 'values', label: 'Values' },
  { id: 'review', label: 'Review' },
];

function Stepper({ step }: { step: Step }) {
  const index = STEPS.findIndex(s => s.id === step);
  return (
    <ol className="mb-6 flex gap-2 text-sm">
      {STEPS.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2">
          <span className={
            'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ' +
            (i <= index || step === 'done' ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground')
          }>{i + 1}</span>
          <span className={i === index ? 'font-medium' : 'text-muted-foreground'}>{s.label}</span>
          {i < STEPS.length - 1 && <span className="text-muted-foreground">›</span>}
        </li>
      ))}
    </ol>
  );
}

function TextField({ id, label, value, onChange, placeholder, hint }: {
  id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <Input id={id} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        className="bg-background text-foreground" />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface AddAircraftPageProps {
  /** Back to the calculator, with the registration just saved (if any). */
  onDone?: (registration?: string) => void;
}

/** Whose aircraft the wizard saves: the user's own, a new club aircraft, or an edit of one. */
export type WizardMode =
  | { kind: 'own' }
  | { kind: 'clubAdd'; club: ClubOption }
  | { kind: 'clubEdit'; club: ClubOption; aircraft: ClubAircraft };

interface AircraftWizardProps extends AddAircraftPageProps {
  mode?: WizardMode;
  /** Leave without saving (club modes, on the admin page). */
  onCancel?: () => void;
}

const EMPTY_DETAILS: Details = { registration: '', code: '', name: '', emptyWeightKg: null, emptyArmM: null, weighedOn: '' };

function initialDetails(mode: WizardMode): Details {
  if (mode.kind !== 'clubEdit') return EMPTY_DETAILS;
  const a = mode.aircraft;
  return {
    registration: a.registration, code: a.spec.code, name: a.spec.name,
    emptyWeightKg: a.emptyWeightKg, emptyArmM: a.emptyArmM, weighedOn: a.weighedOn ?? '',
  };
}

/** Add an aircraft: details -> values (prefilled from the standard) -> review deviations -> save. */
/** Adding aircraft needs an account: they are saved as the user's own. */
const AddAircraftPage: React.FC<AddAircraftPageProps> = props => {
  const { user } = useAuth();
  if (!user) {
    return (
      <div className="mx-auto max-w-md space-y-3 rounded-lg border border-border p-6 text-center">
        <h2 className="text-xl font-semibold">Sign in to add aircraft</h2>
        <p className="text-sm text-muted-foreground">
          Aircraft you add are saved to your account and appear in the calculator on every device you sign in on.
        </p>
        <SignInButton label="Sign in or create an account" />
      </div>
    );
  }
  return <AircraftWizard {...props} />;
};

/** Add an aircraft (the user's own or a club's), or edit a club's: details -> values -> review -> save. */
export const AircraftWizard: React.FC<AircraftWizardProps> = ({ onDone, onCancel, mode = { kind: 'own' } }) => {
  const editing = mode.kind === 'clubEdit' ? mode.aircraft : null;
  const club = mode.kind === 'own' ? null : mode.club;
  const [step, setStep] = React.useState<Step>('details');
  const [details, setDetails] = React.useState<Details>(() => initialDetails(mode));
  const [startFrom, setStartFrom] = React.useState<StartFrom>(editing ? 'current' : 'standard');
  const [changes, setChanges] = React.useState<ValueChange[] | undefined>(undefined);
  const [builtinKey, setBuiltinKey] = React.useState<string>(Object.keys(aircraftData)[0]);
  const [spec, setSpec] = React.useState<AircraftSpec | null>(null);
  const [loadedStandard, setLoadedStandard] = React.useState<StandardTypeResponse | null>(null);
  const [preview, setPreview] = React.useState<ImportPreviewResponse | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [busy, setBusy] = React.useState<'lookup' | 'preview' | null>(null);
  const [message, setMessage] = React.useState<{ kind: 'error' | 'notFound'; text: string } | null>(null);

  const set = <K extends keyof Details>(key: K, value: Details[K]) => setDetails(d => ({ ...d, [key]: value }));

  const detailsComplete = details.registration.trim() !== '' && details.code.trim() !== ''
    && details.emptyWeightKg !== null && details.emptyWeightKg > 0 && details.emptyArmM !== null;

  const request: AirframeImportRequest | null = spec && detailsComplete ? {
    registration: details.registration.trim(),
    emptyWeightKg: details.emptyWeightKg as number,
    emptyArmM: details.emptyArmM as number,
    weighedOn: details.weighedOn || null,
    source: 'MANUAL',
    spec,
  } : null;

  const continueFromDetails = async () => {
    setMessage(null);
    const code = details.code.trim();
    const name = details.name.trim();
    if (startFrom === 'current' && editing) {
      // Keep the values the aircraft uses now, unless already edited in this session.
      setSpec(prev => ({ ...(prev ?? editing.spec), code, name: name || editing.spec.name }));
      setLoadedStandard(null);
      setStep('values');
      return;
    }
    if (startFrom === 'builtin') {
      const base = specFromAircraftData(builtinKey, aircraftData[builtinKey]);
      setSpec({ ...base, code, name: name || base.name });
      setLoadedStandard(null);
      setStep('values');
      return;
    }
    setBusy('lookup');
    try {
      const standard = await fetchStandard(code, name || undefined);
      if (!standard) {
        setMessage({
          kind: 'notFound',
          text: `No standard values are known for ${code}. Start from one of the built-in aircraft instead and enter your POH values.`,
        });
        setStartFrom('builtin');
        return;
      }
      setLoadedStandard(standard);
      setSpec({ ...standard.spec, code, name: name || standard.spec.name });
      if (!name) set('name', standard.spec.name);
      setStep('values');
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Lookup failed.' });
    } finally {
      setBusy(null);
    }
  };

  const goToReview = async () => {
    if (!request) return;
    setMessage(null);
    setBusy('preview');
    try {
      if (editing && club) {
        const result = await previewClubAircraftEdit(club.id, editing.id, request);
        setPreview(result.review);
        setChanges(result.changes);
      } else {
        setPreview(await previewImport(request));
        setChanges(undefined);
      }
      setStep('review');
      window.scrollTo({ top: 0 });
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Comparison failed.' });
    } finally {
      setBusy(null);
    }
  };

  const saveRequest = club
    ? (body: AirframeImportRequest) => (editing ? updateClubAircraft(club.id, editing.id, body) : addClubAircraft(club.id, body))
    : undefined;

  const reset = () => {
    setStep('details');
    setDetails(EMPTY_DETAILS);
    setSpec(null);
    setLoadedStandard(null);
    setPreview(null);
    setResult(null);
    setMessage(null);
  };

  const errorBox = message && (
    <Alert variant={message.kind === 'error' ? 'destructive' : 'warning'}>
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription>{message.text}</AlertDescription>
    </Alert>
  );

  return (
    <div className="mx-auto max-w-4xl">
      <Stepper step={step} />

      {step === 'details' && (
        <div className="space-y-5">
          <div>
            <h2 className="text-2xl font-semibold">
              {editing ? `Edit ${editing.registration}` : club ? `Add an aircraft to ${club.name}` : 'Add an aircraft'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {editing
                ? 'Change what differs, e.g. the empty weight from a new weighing report. You see exactly what changes before saving.'
                : 'Enter the registration, model and the empty weight from the latest weighing report.'}
              {club && !editing && ' It is shown to everyone who shows the club\'s aircraft.'}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField id="registration" label="Registration" placeholder="SE-ABC" value={details.registration}
              onChange={v => set('registration', v)} />
            <TextField id="code" label="Model code" placeholder="PA28-161" value={details.code}
              onChange={v => set('code', v)} hint="As on the type certificate, e.g. PA28-161, DA40NG, TB9." />
            <TextField id="name" label="Model name (optional)" placeholder="Piper PA-28-161 Warrior II" value={details.name}
              onChange={v => set('name', v)} />
            <div className="space-y-1">
              <label htmlFor="weighed-on" className="text-sm font-medium">
                Weighing date <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Input id="weighed-on" type="date" value={details.weighedOn} onChange={e => set('weighedOn', e.target.value)}
                className="bg-background text-foreground" />
            </div>
            <NumField id="empty-weight" label="Basic empty weight" unit="kg" required value={details.emptyWeightKg}
              onChange={v => set('emptyWeightKg', v)} />
            <NumField id="empty-arm" label="Empty weight arm" unit="m" required value={details.emptyArmM}
              onChange={v => set('emptyArmM', v)} />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Starting values</legend>
            {editing && (
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" name="start" className="mt-0.5 accent-blue-600" checked={startFrom === 'current'}
                  onChange={() => setStartFrom('current')} />
                <span>
                  The values {editing.registration} uses now
                  <span className="block text-xs text-muted-foreground">Change only what differs in the next step.</span>
                </span>
              </label>
            )}
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="start" className="mt-0.5 accent-blue-600" checked={startFrom === 'standard'}
                onChange={() => setStartFrom('standard')} />
              <span>
                Standard values for this model
                <span className="block text-xs text-muted-foreground">
                  From the database, or suggested by AI if the model is new. You check and adjust them next.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="start" className="mt-0.5 accent-blue-600" checked={startFrom === 'builtin'}
                onChange={() => setStartFrom('builtin')} />
              <span>Copy from a built-in aircraft</span>
            </label>
            {startFrom === 'builtin' && (
              <select aria-label="Built-in aircraft" value={builtinKey} onChange={e => setBuiltinKey(e.target.value)}
                className="ml-6 block h-10 rounded-md border border-gray-300 bg-background px-3 text-sm">
                {Object.keys(aircraftData).map(key => <option key={key} value={key}>{key}</option>)}
              </select>
            )}
          </fieldset>

          {errorBox}
          {busy === 'lookup' && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" />
              Looking up standard values… The first lookup of a new model asks AI and can take up to a minute.
            </p>
          )}
          <div className={onCancel ? 'flex justify-between' : 'flex justify-end'}>
            {onCancel && <Button variant="outline" onClick={onCancel} disabled={busy !== null}>Cancel</Button>}
            <Button onClick={continueFromDetails} disabled={!detailsComplete || busy !== null}>Continue</Button>
          </div>
        </div>
      )}

      {step === 'values' && spec && (
        <div className="space-y-5">
          <div>
            <h2 className="text-2xl font-semibold">{details.registration.toUpperCase()} values</h2>
            <p className="text-sm text-muted-foreground">
              Check each value against this aircraft&apos;s POH and weighing report, and change any that differ.
              The next step shows how they compare with the standard.
            </p>
          </div>
          {loadedStandard?.standard.status === 'AI_SUGGESTED' && (
            <Alert variant="warning">
              <Sparkles className="h-4 w-4" />
              <AlertTitle>Prefilled with AI-suggested values</AlertTitle>
              <AlertDescription>
                {loadedStandard.standard.name} was not in the database, so these values were suggested by AI and are
                unverified. Replace them with the figures from your POH.
              </AlertDescription>
            </Alert>
          )}
          <AircraftValuesForm spec={spec} onChange={setSpec} />
          {errorBox}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep('details')} disabled={busy !== null}>Back</Button>
            <Button onClick={goToReview} disabled={!request || busy !== null}>
              {busy === 'preview' ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Comparing…</> : 'Review'}
            </Button>
          </div>
        </div>
      )}

      {step === 'review' && request && preview && (
        <ImportReview
          request={request}
          preview={preview}
          onBack={() => setStep('values')}
          onPreviewChanged={setPreview}
          onSaved={r => { setResult(r); setStep('done'); }}
          saveRequest={saveRequest}
          changes={changes}
        />
      )}

      {step === 'done' && result && (
        <div className="space-y-4">
          <Alert variant="success">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>
              {details.registration.toUpperCase()} {editing ? 'updated' : 'saved'}{club ? ` for ${club.name}` : ''}
            </AlertTitle>
            <AlertDescription>
              {result.usesStandard
                ? 'It uses the standard values for its model.'
                : 'Its own values were saved as a variant of the model.'}
              {result.acknowledgedAlerts > 0 && ` ${result.acknowledgedAlerts} confirmed alert${result.acknowledgedAlerts > 1 ? 's were' : ' was'} recorded with it.`}
            </AlertDescription>
          </Alert>
          <div className="flex gap-2">
            {!editing && <Button variant="outline" onClick={reset}>Add another aircraft</Button>}
            {onDone && (
              <Button onClick={() => onDone(details.registration.trim().toUpperCase())}>
                {club ? 'Back to club aircraft' : 'Show in calculator'}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AddAircraftPage;
