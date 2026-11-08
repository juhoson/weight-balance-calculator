import React from 'react';
import {Info} from 'lucide-react';
import {NumberInput} from './ui/NumberInput';
import {Button} from './ui/Button';
import {FormItem, FormLabel} from './ui/Form';

interface GenericEmptyWeightProps {
  /** What the pilot entered, or the typical value. 0 = field cleared. */
  weight: number;
  arm: number;
  typicalWeight: number;
  typicalArm: number;
  /** null = back to the typical values. */
  onChange: (value: { weight: number; arm: number } | null) => void;
}

/**
 * For a generic aircraft: the empty weight and arm of the pilot's own aircraft, from its weighing
 * report. Prefilled with the model's typical values, which are only a placeholder.
 */
const GenericEmptyWeight: React.FC<GenericEmptyWeightProps> = ({weight, arm, typicalWeight, typicalArm, onChange}) => {
  const isTypical = weight === typicalWeight && arm === typicalArm;
  const incomplete = !(weight > 0) || !(arm > 0);
  return (
    <FormItem>
      <FormLabel>Your aircraft&apos;s empty weight</FormLabel>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Empty weight (kg)</span>
          <NumberInput
            aria-label="Empty weight (kg)"
            value={weight}
            min={0}
            step={0.1}
            onChange={w => onChange({weight: w, arm})}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Empty arm (m aft of datum)</span>
          <NumberInput
            aria-label="Empty arm (m)"
            value={arm}
            min={0}
            step={0.001}
            onChange={a => onChange({weight, arm: a})}
          />
        </label>
      </div>
      <div className="space-y-1 text-xs" role="status">
        {incomplete ? (
          <p className="text-red-600">
            Enter both values. Until then the typical values ({typicalWeight} kg, {typicalArm} m) are used.
          </p>
        ) : isTypical ? (
          <p className="flex items-start gap-1 text-amber-700 dark:text-amber-300">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
            These are typical values for the model, not your aircraft&apos;s. Enter the empty weight and arm from its
            latest weighing report.
          </p>
        ) : (
          <p className="flex flex-wrap items-center gap-1 text-muted-foreground">
            Your values are remembered in this browser.
            <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => onChange(null)}>
              Use typical values
            </Button>
          </p>
        )}
      </div>
    </FormItem>
  );
};

export default GenericEmptyWeight;
