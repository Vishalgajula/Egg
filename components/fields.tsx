import type { ReactNode } from 'react';

/**
 * A number field that keeps its value as text.
 *
 * Clearing the box leaves it blank rather than snapping to 0, so a half-typed
 * entry is never mistaken for a real figure. `inputMode` asks phones for the
 * numeric keypad, which is most of what makes daily entry bearable on a phone.
 */
export function NumberField({
  label,
  value,
  onChange,
  hint,
  decimals = false,
  min = '0',
  required = true,
  id,
}: {
  label: ReactNode;
  value: string;
  onChange: (next: string) => void;
  hint?: ReactNode;
  decimals?: boolean;
  min?: string;
  required?: boolean;
  id?: string;
}) {
  return (
    <label htmlFor={id}>
      {label}
      <input
        id={id}
        type="number"
        inputMode={decimals ? 'decimal' : 'numeric'}
        min={min}
        step={decimals ? '0.001' : '1'}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

/**
 * Choose the unit a quantity is entered in.
 *
 * Switching a unit clears the paired field rather than converting it: a farmer
 * changing "trays" to "eggs" means to type a new figure, and silently
 * rewriting 30 into 900 is the kind of help nobody asked for.
 */
export function UnitToggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <fieldset className="unit-toggle">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={value === option.value ? 'is-active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}
