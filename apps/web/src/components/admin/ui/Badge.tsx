import type { ReactNode } from "react";
import type { Tone } from "./types";

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  /** Shows a small dot before the text, for a status. */
  dot?: boolean;
  title?: string;
  size?: "sm" | "md";
}

/** A short label: a status, a plan, a platform. Pair a status colour with a
 *  word ("Waiting 3 days"), never colour alone. */
export function Badge({ tone = "neutral", children, dot, title, size = "sm" }: BadgeProps) {
  return (
    <span className={`adm-badge adm-badge--${tone} adm-badge--${size}`} title={title}>
      {dot && <span className="adm-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Alias kept for pages that think of these as pills. */
export const Pill = Badge;
