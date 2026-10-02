import type { ReactNode } from "react";
import { AdminIcon, type AdminIconName } from "./icons";
import type { Tone } from "./types";
import "./forms.css";

interface NoticeProps {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  /** Replaces the icon, e.g. with a spinner for "sending". */
  icon?: ReactNode;
  /** "alert" for failures (read out at once), "status" otherwise. */
  role?: "status" | "alert";
}

const ICONS: Partial<Record<Tone, AdminIconName>> = { bad: "alert", warn: "alert" };

/** An inline message inside a panel: the result of an action, a warning, or a
 *  "this is still running" line. Pair the tone with words, never colour alone. */
export function Notice({ tone = "neutral", title, children, icon, role }: NoticeProps) {
  const iconName = ICONS[tone];
  return (
    <div className={`adm-notice adm-notice--${tone}`} role={role ?? (tone === "bad" ? "alert" : "status")}>
      {(icon || iconName) && <span className="adm-notice__icon">{icon ?? <AdminIcon name={iconName!} size={16} />}</span>}
      <div className="adm-notice__body">
        {title && <span className="adm-notice__title">{title}</span>}
        {children}
      </div>
    </div>
  );
}

/** A small spinning ring, for buttons and notices while something runs. */
export function Spinner({ label }: { label?: string }) {
  return <span className="adm-spinner" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}
