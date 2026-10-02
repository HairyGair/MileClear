"use client";

import type { KeyboardEvent } from "react";

interface SegProps<V extends string> {
  value: V;
  onChange: (v: V) => void;
  options: Array<{ value: V; label: string; title?: string }>;
  /** Names the group for screen readers. */
  label: string;
}

/** A small segmented control in the kit's DateRange style, for any set of
 *  options (the kit's DateRange only knows 7d / 30d / 90d / All). */
export function Seg<V extends string>({ value, onChange, options, label }: SegProps<V>) {
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % options.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + options.length) % options.length;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next].value);
    const group = e.currentTarget.parentElement;
    (group?.children[next] as HTMLButtonElement | undefined)?.focus();
  };
  return (
    <div className="adm-seg" role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          title={o.title}
          className={`adm-seg__opt${o.value === value ? " adm-seg__opt--active" : ""}`}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
