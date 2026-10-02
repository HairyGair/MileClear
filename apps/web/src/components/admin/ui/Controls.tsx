"use client";

// Form controls for admin pages: a filter bar, search box, select, toggle
// chips, a text field and a pager. Styles live in ./controls.css.

import type { ReactNode } from "react";
import { AdminIcon } from "./icons";
import type { Tone } from "./types";
import "./controls.css";

/** A wrapping row of filters. Put it at the top of a Panel body. */
export function FilterBar({ children, spaced = true }: { children: ReactNode; spaced?: boolean }) {
  return <div className={`adm-ctl-bar${spaced ? " adm-ctl-bar--spaced" : ""}`}>{children}</div>;
}

interface SearchFieldProps {
  id: string;
  value: string;
  onChange: (v: string) => void;
  /** Read by screen readers. */
  label: string;
  placeholder?: string;
}

/** A search box with a magnifier. Grows to fill a FilterBar row. */
export function SearchField({ id, value, onChange, label, placeholder }: SearchFieldProps) {
  return (
    <div className="adm-ctl-field adm-ctl-field--grow">
      <label htmlFor={id} className="adm-sr">{label}</label>
      <span className="adm-ctl-search-icon" aria-hidden="true"><AdminIcon name="search" size={14} /></span>
      <input
        id={id}
        type="search"
        className="adm-ctl-input adm-ctl-input--search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
    </div>
  );
}

interface SelectFieldProps {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  /** Read by screen readers; shown above the field when `showLabel`. */
  label: string;
  showLabel?: boolean;
  minWidth?: number;
}

/** A native select in the admin style. */
export function SelectField({ id, value, onChange, options, label, showLabel, minWidth }: SelectFieldProps) {
  return (
    <div className="adm-ctl-field" style={minWidth ? { minWidth } : undefined}>
      <label htmlFor={id} className={showLabel ? "adm-ctl-label" : "adm-sr"}>{label}</label>
      <select id={id} className="adm-ctl-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
  /** Colour when on. Defaults to amber. */
  tone?: Exclude<Tone, "neutral" | "accent">;
  disabled?: boolean;
}

/** An on/off filter, or one option in a row of status buttons. */
export function FilterChip({ active, onClick, children, title, tone, disabled }: FilterChipProps) {
  return (
    <button
      type="button"
      className={`adm-ctl-chip${tone ? ` adm-ctl-chip--${tone}` : ""}`}
      aria-pressed={active}
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

interface TextFieldProps {
  id: string;
  value: string;
  onChange: (v: string) => void;
  label: string;
  showLabel?: boolean;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
}

/** A plain text input, or a textarea with `multiline`. */
export function TextField({ id, value, onChange, label, showLabel, placeholder, multiline, rows = 3 }: TextFieldProps) {
  return (
    <div className="adm-ctl-field" style={{ width: "100%" }}>
      <label htmlFor={id} className={showLabel ? "adm-ctl-label" : "adm-sr"}>{label}</label>
      {multiline ? (
        <textarea id={id} className="adm-ctl-textarea" rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} type="text" className="adm-ctl-input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

interface PagerProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  /** Optional "41 accounts" style note on the left. */
  info?: ReactNode;
}

/** Previous / next for a server-paged list. Renders nothing for one page
 *  unless there is an `info` line to show. */
export function Pager({ page, totalPages, onChange, info }: PagerProps) {
  if (totalPages <= 1 && !info) return null;
  return (
    <nav className="adm-ctl-pager" aria-label="Pages">
      <span className="adm-ctl-pager__info">
        {info}
        {totalPages > 1 && <>{info ? " · " : ""}Page {page} of {totalPages}</>}
      </span>
      {totalPages > 1 && (
        <span className="adm-ctl-pager__btns">
          <button type="button" className="adm-btn adm-btn--sm" onClick={() => onChange(page - 1)} disabled={page <= 1}>
            <AdminIcon name="arrowLeft" size={14} /> Previous
          </button>
          <button type="button" className="adm-btn adm-btn--sm" onClick={() => onChange(page + 1)} disabled={page >= totalPages}>
            Next <AdminIcon name="arrowRight" size={14} />
          </button>
        </span>
      )}
    </nav>
  );
}
