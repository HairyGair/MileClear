"use client";

import { useRef, type KeyboardEvent } from "react";
import { Icon, type IconName } from "./Icon";
import { cx } from "./cx";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/**
 * Two to four options for one view (Work | Personal, All | Inbox | ...).
 * Radiogroup with arrow-key support.
 *
 *   <Segmented ariaLabel="Show trips" value={view} onChange={setView}
 *     options={[{ value: "all", label: "All" }, { value: "inbox", label: "Inbox", count: 4 }]} />
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  size?: "md" | "lg";
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (index + 1) % options.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (index - 1 + options.length) % options.length;
    if (next >= 0) {
      e.preventDefault();
      onChange(options[next].value);
      refs.current[next]?.focus();
    }
  }

  return (
    <div className={cx("mc-seg", size === "lg" && "mc-seg--lg")} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            className={cx("mc-seg__item", selected && "is-selected")}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {o.label}
            {o.count !== undefined && o.count > 0 && <span className="mc-seg__count">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A row of filter chips. `single` makes it an exclusive set (value has 0 or 1
 * entries); otherwise each chip toggles.
 *
 *   <FilterChips options={platforms} value={selected} onChange={setSelected} />
 */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  single = false,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
  single?: boolean;
  ariaLabel?: string;
}) {
  function toggle(v: T) {
    const on = value.includes(v);
    if (single) onChange(on ? [] : [v]);
    else onChange(on ? value.filter((x) => x !== v) : [...value, v]);
  }
  return (
    <div className="mc-chips" role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            className={cx("mc-chip", on && "is-on")}
            onClick={() => toggle(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Small status word with an optional icon. Colour is never the only cue. */
export function StatusChip({
  tone,
  label,
  icon,
}: {
  tone: "neutral" | "amber" | "green" | "red";
  label: string;
  icon?: IconName;
}) {
  return (
    <span className={cx("mc-status", `mc-status--${tone}`)}>
      {icon && <Icon name={icon} size={12} />}
      {label}
    </span>
  );
}
