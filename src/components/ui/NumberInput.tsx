import * as React from "react";
import { cn } from "../../lib/utils";
import { Input } from "./Input";

export interface NumberInputProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
}

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
    ({ className, value, onChange, min, max, step = 1, unit, ...props }, ref) => {
        const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
            const newValue = event.target.value === "" ? 0 : parseFloat(event.target.value);
            if (isNaN(newValue)) return;

            if (min !== undefined && newValue < min) return;
            if (max !== undefined && newValue > max) return;

            onChange(newValue);
        };

        return (
            <div className="relative">
                <Input
                    type="number"
                    value={value || ""}
                    onChange={handleChange}
                    min={min}
                    max={max}
                    step={step}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    ref={ref}
                    {...props}
                />
                {unit && (
                    <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-500">
                        {unit}
                    </div>
                )}
            </div>
        );
    }
);
NumberInput.displayName = "NumberInput";

export { NumberInput };