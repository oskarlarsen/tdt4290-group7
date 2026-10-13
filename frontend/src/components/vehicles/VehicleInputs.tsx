import { useId, useState } from "react";
import { normalizePlate } from "../../utils/vehicle";
import { catalogLabel } from "../../utils/vehicleCatalog";
import { inputClass } from "./VehicleDialog";

/** Normalize harmless formatting only; never truncate or guess a mistyped plate. */
export function RegistrationNumberInput({ value, onChange, readOnly = false, disabled = false, autoFocus = false }: {
  value: string; onChange: (value: string) => void; readOnly?: boolean; disabled?: boolean; autoFocus?: boolean;
}) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const invalid = touched && !/^[A-Z]{2}[1-9][0-9]{3,4}$/.test(value);
  return <>
    <input required autoFocus={autoFocus} readOnly={readOnly} disabled={disabled} className={`${inputClass} font-mono`}
      value={value} onChange={event => onChange(normalizePlate(event.target.value))} onBlur={() => setTouched(true)}
      pattern="[A-Z]{2}[1-9][0-9]{3,4}" title="Two letters and four or five digits, without a leading zero"
      autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-invalid={invalid} aria-describedby={id} />
    <span id={id} className={`mt-1 block text-xs ${invalid ? "text-red-700" : "text-neutral-500"}`}>
      {invalid ? "Enter two letters and four or five digits, without a leading zero." : "Ordinary Norwegian number, e.g. AB12345 or AB1234. Spaces are removed automatically."}
    </span>
  </>;
}

export function CatalogSelect({ catalog, value, onChange, disabled = false, notApplicable = false }: {
  catalog: Readonly<Record<string, string>>; value: string; onChange: (value: string) => void;
  disabled?: boolean; notApplicable?: boolean;
}) {
  return <select required className={inputClass} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>
    <option value="" disabled>Select a value</option>
    {Object.entries(catalog).filter(([code]) => code !== "NOT_APPLICABLE" || notApplicable).map(([code]) =>
      <option key={code} value={code}>{catalogLabel(catalog, code)}</option>)}
  </select>;
}
