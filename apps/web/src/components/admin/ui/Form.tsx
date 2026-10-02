"use client";

// Form fields for admin pages (composers, filters, small dialogs). Styles in
// ./forms.css. Every field has a visible label tied to its control.

import { useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import "./forms.css";

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  /** Render the control; gets the id to put on it. */
  children: (id: string) => ReactNode;
  id?: string;
}

/** A label, a control and an optional hint underneath. */
export function Field({ label, hint, children, id }: FieldProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="adm-field">
      <label className="adm-field__label" htmlFor={fid}>
        {label}
      </label>
      {children(fid)}
      {hint && <span className="adm-field__hint">{hint}</span>}
    </div>
  );
}

type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & { label: ReactNode; hint?: ReactNode; mono?: boolean; id?: string };

export function TextInput({ label, hint, mono, id, className = "", ...rest }: TextInputProps) {
  return (
    <Field label={label} hint={hint} id={id}>
      {(fid) => <input id={fid} className={`adm-input${mono ? " adm-input--mono" : ""} ${className}`.trim()} {...rest} />}
    </Field>
  );
}

type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & { label: ReactNode; hint?: ReactNode; mono?: boolean; id?: string };

export function TextArea({ label, hint, mono, id, className = "", ...rest }: TextAreaProps) {
  return (
    <Field label={label} hint={hint} id={id}>
      {(fid) => <textarea id={fid} className={`adm-input${mono ? " adm-input--mono" : ""} ${className}`.trim()} {...rest} />}
    </Field>
  );
}

type SelectInputProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  label: ReactNode;
  hint?: ReactNode;
  options: ReadonlyArray<{ value: string; label: string }>;
  id?: string;
};

export function SelectInput({ label, hint, options, id, className = "", ...rest }: SelectInputProps) {
  return (
    <Field label={label} hint={hint} id={id}>
      {(fid) => (
        <select id={fid} className={`adm-input ${className}`.trim()} {...rest}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
  title?: string;
}

export function Checkbox({ checked, onChange, children, disabled, title }: CheckboxProps) {
  return (
    <label className="adm-check" title={title}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

interface ChoiceChipsProps<V extends string> {
  label: string;
  value: V;
  onChange: (v: V) => void;
  options: ReadonlyArray<{ value: V; label: string }>;
  disabled?: boolean;
}

/** A single choice from a short list, as a row of pills (radio group). */
export function ChoiceChips<V extends string>({ label, value, onChange, options, disabled }: ChoiceChipsProps<V>) {
  return (
    <div className="adm-field">
      <span className="adm-field__label">{label}</span>
      <div className="adm-chips" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className="adm-chip"
            disabled={disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Long text in a table cell (an error message): one line, click to read all. */
export function ExpandableText({ text, max = 320 }: { text: string; max?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      className="adm-expand"
      style={{ maxWidth: max }}
      aria-expanded={open}
      title={open ? "Click to collapse" : "Click to read the full message"}
      onClick={() => setOpen((o) => !o)}
    >
      {text}
    </button>
  );
}
