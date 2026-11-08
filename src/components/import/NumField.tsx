import React from 'react';
import { Input } from '../ui/Input';
import { cn } from '../../lib/utils';

interface NumFieldProps {
  id: string;
  label?: string;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  unit?: string;
  required?: boolean;
  className?: string;
  /** For table cells, where the column header is the visible label. */
  ariaLabel?: string;
}

const parse = (text: string): number | null => {
  if (text.trim() === '') return null;
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Number input that keeps what is typed ("2.", "", "2,4") until it parses, and accepts a comma decimal. */
const NumField: React.FC<NumFieldProps> = ({ id, label, value, onChange, unit, required, className, ariaLabel }) => {
  const [text, setText] = React.useState(value === null || value === undefined ? '' : String(value));
  // Read through a ref so the effect below runs only when the value changes from outside.
  const textRef = React.useRef(text);
  textRef.current = text;

  React.useEffect(() => {
    if (parse(textRef.current) !== (value ?? null)) {
      setText(value === null || value === undefined ? '' : String(value));
    }
  }, [value]);

  return (
    <div className={cn('space-y-1', className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium">
          {label}{required ? '' : <span className="font-normal text-muted-foreground"> (optional)</span>}
        </label>
      )}
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          aria-label={ariaLabel}
          value={text}
          onChange={e => {
            setText(e.target.value);
            onChange(parse(e.target.value));
          }}
          className={cn('bg-background text-foreground tabular-nums', unit ? 'pr-12' : '')}
        />
        {unit && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
};

export default NumField;
