import React from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, Info, Sparkles, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/Button';
import { Alert, AlertDescription, AlertTitle } from '../ui/Alert';
import EnvelopeComparisonChart from './EnvelopeComparisonChart';
import { ApiError, confirmImport } from '../../api/backend';
import {
  countBySeverity,
  formatDifference,
  formatNumber,
  SECTION_ORDER,
  sectionOf,
} from '../../lib/aircraftSpec';
import { cn } from '../../lib/utils';
import type {
  AirframeImportRequest,
  Deviation,
  ImportPreviewResponse,
  ImportResult,
  Severity,
  UnacknowledgedAlertsBody,
} from '../../types/airframeImport';

interface ImportReviewProps {
  request: AirframeImportRequest;
  preview: ImportPreviewResponse;
  /** Back to the values form, to correct something. */
  onBack: () => void;
  onSaved: (result: ImportResult) => void;
  /** The server's re-check on save found different alerts; show its version. */
  onPreviewChanged: (preview: ImportPreviewResponse) => void;
}

const SEVERITY_STYLES: Record<Severity, { badge: string; border: string; label: string }> = {
  ALERT: {
    badge: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
    border: 'border-red-300 dark:border-red-800',
    label: 'Alert',
  },
  WARNING: {
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
    border: 'border-amber-300 dark:border-amber-800',
    label: 'Check',
  },
  INFO: {
    badge: 'bg-muted text-muted-foreground',
    border: 'border-border',
    label: 'Minor',
  },
};

function SeverityBadge({ severity }: { severity: Severity }) {
  const style = SEVERITY_STYLES[severity];
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', style.badge)}>
      {style.label}
    </span>
  );
}

function ValueCell({ value, unit }: { value: number | null; unit: string | null }) {
  return (
    <span className="tabular-nums">
      {formatNumber(value)}
      {value !== null && unit ? <span className="text-muted-foreground"> {unit}</span> : null}
    </span>
  );
}

function groupBySection(deviations: Deviation[]): Array<[string, Deviation[]]> {
  const groups = new Map<string, Deviation[]>();
  deviations.forEach(d => {
    const section = sectionOf(d.field);
    groups.set(section, [...(groups.get(section) ?? []), d]);
  });
  return SECTION_ORDER.filter(s => groups.has(s)).map(s => [s, groups.get(s) as Deviation[]]);
}

/** One alert that the pilot must explicitly confirm before the aircraft can be saved. */
function AlertCard({ deviation, acknowledged, onToggle }: {
  deviation: Deviation;
  acknowledged: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const id = `ack-${deviation.field}`;
  return (
    <li
      className={cn(
        'rounded-lg border p-4 transition-colors',
        acknowledged
          ? 'border-border bg-muted/40'
          : 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{deviation.label}</p>
          <p className="text-xs text-muted-foreground">{sectionOf(deviation.field)}</p>
        </div>
        <div className="flex gap-1">
          {deviation.permissive && (
            <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
              More permissive
            </span>
          )}
          <SeverityBadge severity="ALERT" />
        </div>
      </div>

      {deviation.standardValue !== null || deviation.importedValue !== null ? (
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Your value</dt>
            <dd className="font-semibold"><ValueCell value={deviation.importedValue} unit={deviation.unit} /></dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Standard</dt>
            <dd><ValueCell value={deviation.standardValue} unit={deviation.unit} /></dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Difference</dt>
            <dd className="tabular-nums">{formatDifference(deviation)}</dd>
          </div>
        </dl>
      ) : null}
      <p className="mt-2 text-sm text-muted-foreground">{deviation.message}</p>

      <label htmlFor={id} className="mt-3 flex cursor-pointer items-start gap-2 text-sm">
        <input
          id={id}
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
          checked={acknowledged}
          onChange={e => onToggle(e.target.checked)}
        />
        <span>
          I have checked this against the POH / weighing report, and my value is correct for this aircraft.
        </span>
      </label>
    </li>
  );
}

function DeviationTable({ deviations }: { deviations: Deviation[] }) {
  return (
    <div className="space-y-4">
      {groupBySection(deviations).map(([section, rows]) => (
        <div key={section}>
          <h4 className="mb-1 text-sm font-medium text-muted-foreground">{section}</h4>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Value</th>
                  <th className="px-3 py-2 font-medium">Yours</th>
                  <th className="px-3 py-2 font-medium">Standard</th>
                  <th className="px-3 py-2 font-medium">Difference</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(d => (
                  <tr key={d.field} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={d.severity} />
                        <span>{d.label}</span>
                      </div>
                      {d.importedValue === null || d.standardValue === null ? (
                        <p className="mt-1 text-xs text-muted-foreground">{d.message}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 font-medium"><ValueCell value={d.importedValue} unit={d.unit} /></td>
                    <td className="px-3 py-2"><ValueCell value={d.standardValue} unit={d.unit} /></td>
                    <td className="px-3 py-2 tabular-nums">{formatDifference(d)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReferenceCard({ preview }: { preview: ImportPreviewResponse }) {
  const { standard } = preview;
  if (!standard) {
    return (
      <Alert variant="warning">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>No reference values for this model</AlertTitle>
        <AlertDescription>
          {preview.referenceNotice ?? 'Nothing could be compared. Check every value against the POH and weighing report.'}
        </AlertDescription>
      </Alert>
    );
  }
  const ai = standard.status === 'AI_SUGGESTED';
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        {ai ? <Sparkles className="h-4 w-4 text-amber-500" /> : <ShieldCheck className="h-4 w-4 text-green-600" />}
        <span className="text-sm text-muted-foreground">Compared with</span>
        <span className="font-medium">{standard.name}</span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium',
            ai
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
              : 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200'
          )}
        >
          {ai ? 'AI-suggested · unverified' : 'Curated standard'}
        </span>
      </div>
      {preview.referenceNotice && <p className="mt-2 text-sm text-muted-foreground">{preview.referenceNotice}</p>}
      {ai && standard.aiNotes && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            What the AI said about these values
          </summary>
          <p className="mt-1 whitespace-pre-line">{standard.aiNotes}</p>
          {standard.aiModel && <p className="mt-1 text-xs text-muted-foreground">Model: {standard.aiModel}</p>}
        </details>
      )}
    </div>
  );
}

const ImportReview: React.FC<ImportReviewProps> = ({ request, preview, onBack, onSaved, onPreviewChanged }) => {
  const [acknowledged, setAcknowledged] = React.useState<Set<string>>(new Set());
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const alerts = preview.deviations.filter(d => d.severity === 'ALERT');
  const warnings = preview.deviations.filter(d => d.severity === 'WARNING');
  const minor = preview.deviations.filter(d => d.severity === 'INFO');
  const counts = countBySeverity(preview.deviations);
  const required = preview.alertsRequiringAcknowledgement;
  const remaining = required.filter(f => !acknowledged.has(f)).length;
  const hasEnvelopeChanges = preview.deviations.some(d => d.field.startsWith('envelope.'));

  // A new comparison (e.g. after the server's re-check) keeps only acknowledgements that still apply.
  React.useEffect(() => {
    setAcknowledged(prev => new Set(Array.from(prev).filter(f => preview.alertsRequiringAcknowledgement.includes(f))));
  }, [preview]);

  const toggle = (field: string, checked: boolean) => {
    setAcknowledged(prev => {
      const next = new Set(prev);
      if (checked) next.add(field); else next.delete(field);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await confirmImport({ ...request, acknowledgedAlerts: Array.from(acknowledged) });
      onSaved(result);
    } catch (e) {
      if (e instanceof ApiError && e.status === 422 && e.body && typeof e.body === 'object') {
        const body = e.body as UnacknowledgedAlertsBody;
        const fields = Array.from(new Set(body.deviations.filter(d => d.severity === 'ALERT').map(d => d.field)));
        onPreviewChanged({ ...preview, deviations: body.deviations, alertsRequiringAcknowledgement: fields });
        setError('The final check found alerts that still need confirming. Review them below.');
      } else if (e instanceof ApiError && e.status === 409) {
        setError(`You already have an aircraft registered as ${request.registration.toUpperCase()}.`);
      } else {
        setError(e instanceof Error ? e.message : 'Saving failed.');
      }
    } finally {
      setSaving(false);
    }
  };

  let summary: React.ReactNode;
  if (!preview.standard) {
    summary = null;
  } else if (preview.deviations.length === 0) {
    summary = (
      <Alert variant="success">
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>Everything matches the standard</AlertTitle>
        <AlertDescription>{request.registration.toUpperCase()} will use the standard {preview.standard.name} values.</AlertDescription>
      </Alert>
    );
  } else {
    summary = (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="font-medium">
          {preview.matchesStandard
            ? 'Type values match the standard; the aircraft will use it.'
            : 'Your values differ from the standard and will be saved as this aircraft\'s own variant.'}
        </span>
        <span className="flex gap-2">
          {counts.ALERT > 0 && <span className="text-red-700 dark:text-red-300">{counts.ALERT} alert{counts.ALERT > 1 ? 's' : ''}</span>}
          {counts.WARNING > 0 && <span className="text-amber-700 dark:text-amber-300">{counts.WARNING} to check</span>}
          {counts.INFO > 0 && <span className="text-muted-foreground">{counts.INFO} minor</span>}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Review {request.registration.toUpperCase()}</h2>
        <p className="text-sm text-muted-foreground">
          {request.spec.name} · empty weight {formatNumber(request.emptyWeightKg)} kg at {formatNumber(request.emptyArmM)} m
        </p>
      </div>

      <ReferenceCard preview={preview} />
      {summary}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {alerts.length > 0 && (
        <section aria-labelledby="alerts-heading">
          <h3 id="alerts-heading" className="flex items-center gap-2 text-lg font-semibold">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Confirm before saving
          </h3>
          <p className="mb-3 text-sm text-muted-foreground">
            These differ a lot from the standard, or allow more than it does. If one is a mistake,
            go back and correct it instead of confirming.
          </p>
          <ul className="space-y-3">
            {alerts.map(d => (
              <AlertCard
                key={d.field}
                deviation={d}
                acknowledged={acknowledged.has(d.field)}
                onToggle={checked => toggle(d.field, checked)}
              />
            ))}
          </ul>
        </section>
      )}

      {preview.standardSpec && hasEnvelopeChanges && (
        <section aria-labelledby="envelope-heading">
          <h3 id="envelope-heading" className="text-lg font-semibold">CG envelope</h3>
          <EnvelopeComparisonChart
            standard={preview.standardSpec.envelope.points}
            imported={request.spec.envelope.points}
          />
        </section>
      )}

      {warnings.length > 0 && (
        <section aria-labelledby="warnings-heading">
          <h3 id="warnings-heading" className="mb-2 text-lg font-semibold">Worth checking</h3>
          <DeviationTable deviations={warnings} />
        </section>
      )}

      {minor.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
            <Info className="h-4 w-4" />
            {minor.length} minor difference{minor.length > 1 ? 's' : ''}
          </summary>
          <div className="mt-2">
            <DeviationTable deviations={minor} />
          </div>
        </details>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" onClick={onBack} disabled={saving}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to values
        </Button>
        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <Button onClick={save} disabled={saving || remaining > 0}>
            {saving ? 'Saving…' : `Save ${request.registration.toUpperCase()}`}
          </Button>
          {remaining > 0 && (
            <span className="text-xs text-muted-foreground">
              Confirm {remaining} more alert{remaining > 1 ? 's' : ''} to save
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportReview;
