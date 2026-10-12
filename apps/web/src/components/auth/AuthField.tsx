"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type"> & { id: string };

/** A labelled field in the account pages' style. `aside` sits right of the label (e.g. "Forgot?"). */
export function AuthField({
  label,
  aside,
  type = "text",
  ...input
}: InputProps & { label: string; aside?: ReactNode; type?: string }) {
  return (
    <div className="signin__field">
      <FieldLabel id={input.id} label={label} aside={aside} />
      <input className="signin__input" type={type} {...input} />
    </div>
  );
}

/** A password field with a show/hide button. */
export function AuthPasswordField({ label, aside, ...input }: InputProps & { label: string; aside?: ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div className="signin__field">
      <FieldLabel id={input.id} label={label} aside={aside} />
      <div className="signin__input-wrap">
        <input className="signin__input signin__input--password" type={show ? "text" : "password"} {...input} />
        <button
          type="button"
          className="signin__eye"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
        >
          {show ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-6.5 0-10-7-10-7a18.5 18.5 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19" />
              <path d="M1 1l22 22" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

function FieldLabel({ id, label, aside }: { id: string; label: string; aside?: ReactNode }) {
  const el = (
    <label className="signin__label" htmlFor={id}>
      {label}
    </label>
  );
  return aside ? (
    <div className="signin__label-row">
      {el}
      {aside}
    </div>
  ) : (
    el
  );
}
