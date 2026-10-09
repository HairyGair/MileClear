"use client";

import { useId, useState, type ReactNode } from "react";
import { presetRange, PRESET_LABELS, type PeriodPreset } from "../../../lib/dashboard/periods";
import { Icon } from "./Icon";
import { cx } from "./cx";

interface BaseProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
}

function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
}: BaseProps & { id: string; children: ReactNode }) {
  return (
    <div className="mc-field">
      <label className="mc-field__label" htmlFor={id}>
        {label}
        {required === false && <span className="mc-field__opt"> (optional)</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="mc-field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="mc-field__error" id={`${id}-err`}>
          <Icon name="alert-circle-outline" size={14} /> {error}
        </p>
      )}
    </div>
  );
}

function describe(id: string, hint?: string, error?: string) {
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-err` : hint ? `${id}-hint` : undefined,
  };
}

export function TextField({
  label, value, onChange, hint, error, required, disabled, type = "text", placeholder, autoComplete, maxLength,
}: BaseProps & {
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "email" | "password" | "tel" | "url";
  placeholder?: string;
  autoComplete?: string;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <Field id={id} label={label} hint={hint} error={error} required={required}>
      <input
        id={id}
        className="mc-input"
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        maxLength={maxLength}
        disabled={disabled}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        {...describe(id, hint, error)}
      />
    </Field>
  );
}

/** Whole or decimal number kept as text while typing. `suffix` e.g. "mi". */
export function NumberField({
  label, value, onChange, hint, error, required, disabled, suffix, decimals = true,
}: BaseProps & { value: string; onChange: (v: string) => void; suffix?: string; decimals?: boolean }) {
  const id = useId();
  return (
    <Field id={id} label={label} hint={hint} error={error} required={required}>
      <div className="mc-affix">
        <input
          id={id}
          className={cx("mc-input mc-num", suffix && "mc-input--suffix")}
          type="text"
          inputMode={decimals ? "decimal" : "numeric"}
          value={value}
          disabled={disabled}
          required={required}
          onChange={(e) => onChange(e.target.value.replace(decimals ? /[^0-9.]/g : /[^0-9]/g, ""))}
          {...describe(id, hint, error)}
        />
        {suffix && <span className="mc-affix__suffix">{suffix}</span>}
      </div>
    </Field>
  );
}

/** Money in pence. The driver types pounds; `value` and `onChange` are pence. */
export function MoneyField({
  label, value, onChange, hint, error, required, disabled,
}: BaseProps & { value: number | null; onChange: (pence: number | null) => void }) {
  const id = useId();
  const [text, setText] = useState(value === null ? "" : (value / 100).toFixed(2));
  return (
    <Field id={id} label={label} hint={hint} error={error} required={required}>
      <div className="mc-affix">
        <span className="mc-affix__prefix">£</span>
        <input
          id={id}
          className="mc-input mc-num mc-input--prefix"
          type="text"
          inputMode="decimal"
          value={text}
          disabled={disabled}
          required={required}
          onChange={(e) => {
            const cleaned = e.target.value.replace(/[^0-9.]/g, "");
            setText(cleaned);
            const n = parseFloat(cleaned);
            onChange(Number.isFinite(n) ? Math.round(n * 100) : null);
          }}
          {...describe(id, hint, error)}
        />
      </div>
    </Field>
  );
}

export function SelectField({
  label, value, onChange, hint, error, required, disabled, options,
}: BaseProps & { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const id = useId();
  return (
    <Field id={id} label={label} hint={hint} error={error} required={required}>
      <div className="mc-select">
        <select
          id={id}
          className="mc-input"
          value={value}
          disabled={disabled}
          required={required}
          onChange={(e) => onChange(e.target.value)}
          {...describe(id, hint, error)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" size={16} className="mc-select__chev" />
      </div>
    </Field>
  );
}

function NativeField({ kind, label, value, onChange, hint, error, required, disabled }: BaseProps & { kind: "date" | "time"; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <Field id={id} label={label} hint={hint} error={error} required={required}>
      <input
        id={id}
        className="mc-input mc-num"
        type={kind}
        value={value}
        disabled={disabled}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        {...describe(id, hint, error)}
      />
    </Field>
  );
}

/** `value` is YYYY-MM-DD. */
export function DateField(p: BaseProps & { value: string; onChange: (v: string) => void }) {
  return <NativeField kind="date" {...p} />;
}

/** `value` is HH:MM. */
export function TimeField(p: BaseProps & { value: string; onChange: (v: string) => void }) {
  return <NativeField kind="time" {...p} />;
}

export function DateRangeField({
  from, to, onChange, presets = ["thisWeek", "thisMonth", "lastMonth", "thisTaxYear", "lastTaxYear"],
}: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  presets?: PeriodPreset[];
}) {
  return (
    <div className="mc-range">
      <div className="mc-chips" role="group" aria-label="Quick ranges">
        {presets.map((p) => {
          const r = presetRange(p);
          const on = r.from === from && r.to === to;
          return (
            <button key={p} type="button" aria-pressed={on} className={cx("mc-chip", on && "is-on")} onClick={() => onChange(r)}>
              {PRESET_LABELS[p]}
            </button>
          );
        })}
      </div>
      <div className="mc-range__inputs">
        <DateField label="From" value={from} onChange={(v) => onChange({ from: v, to })} />
        <DateField label="To" value={to} onChange={(v) => onChange({ from, to: v })} />
      </div>
    </div>
  );
}

export function TextArea({
  label, value, onChange, hint, error, required, disabled, maxLength, rows = 4,
}: BaseProps & { value: string; onChange: (v: string) => void; maxLength?: number; rows?: number }) {
  const id = useId();
  return (
    <Field id={id} label={label} hint={hint} error={error} required={required}>
      <textarea
        id={id}
        className="mc-input mc-textarea"
        rows={rows}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        {...describe(id, hint, error)}
      />
    </Field>
  );
}

/** Stand-alone switch with a label (not inside a SettingsGroup). */
export function Toggle({
  label, value, onChange, hint, disabled,
}: BaseProps & { value: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="mc-field mc-field--toggle">
      <label htmlFor={id} className="mc-field__label mc-field__label--inline">
        {label}
      </label>
      <input id={id} type="checkbox" role="switch" className="mc-switch" checked={value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {hint && <p className="mc-field__hint">{hint}</p>}
    </div>
  );
}
