"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { ProChip } from "./Pro";
import { cx } from "./cx";

/** Titled group of rows (the app's grouped list). */
export function SettingsGroup({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <div className="mc-group">
      {title && <h2 className="mc-group__title">{title}</h2>}
      <div className="mc-card mc-card--flush mc-group__card">{children}</div>
      {footer && <p className="mc-group__footer">{footer}</p>}
    </div>
  );
}

export interface SettingsRowProps {
  icon: IconName;
  label: string;
  hint?: string;
  href?: string;
  external?: boolean;
  onClick?: () => void;
  /** "pro" shows the PRO chip to free drivers. A number or string shows a count. */
  badge?: "pro" | number | string;
  right?: ReactNode;
  danger?: boolean;
}

/**
 * One list row: icon tile, label, hint, chevron. A link when `href` is set, a
 * button when `onClick` is set, otherwise a plain display row.
 *
 *   <SettingsRow icon="car-outline" label="Vehicles" hint="Your cars" href="/dashboard/vehicles" />
 */
export function SettingsRow({ icon, label, hint, href, external, onClick, badge, right, danger }: SettingsRowProps) {
  const body = (
    <>
      <span className="mc-row__icon">
        <Icon name={icon} size={18} />
      </span>
      <span className="mc-row__text">
        <span className="mc-row__label">
          {label}
          {badge === "pro" && <ProChip />}
          {badge !== undefined && badge !== "pro" && <span className="mc-count">{badge}</span>}
        </span>
        {hint && <span className="mc-row__hint">{hint}</span>}
      </span>
      {right && <span className="mc-row__right">{right}</span>}
      {!danger && (href || onClick) && (
        <Icon name={external ? "open-outline" : "chevron-forward"} size={16} className="mc-row__chev" />
      )}
    </>
  );
  const cls = cx("mc-row", danger && "mc-row--danger", (href || onClick) && "mc-row--interactive");

  if (href && external) {
    return (
      <a className={cls} href={href} target="_blank" rel="noopener noreferrer">
        {body}
      </a>
    );
  }
  if (href) {
    return (
      <Link className={cls} href={href} onClick={onClick}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** Row with a switch. The whole row toggles. */
export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
  badge,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  badge?: "pro";
}) {
  return (
    <label className={cx("mc-row mc-row--interactive mc-row--toggle", disabled && "is-disabled")}>
      <span className="mc-row__text">
        <span className="mc-row__label">
          {label}
          {badge === "pro" && <ProChip />}
        </span>
        {hint && <span className="mc-row__hint">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="mc-switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
