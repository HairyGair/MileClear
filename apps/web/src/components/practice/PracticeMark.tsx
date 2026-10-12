"use client";

import { useState } from "react";
import { API_BASE } from "../../lib/practice";

/**
 * How a practice is shown to a driver: its logo once MileClear has checked
 * the practice and the logo, otherwise an initials tile. Never amber, so it
 * cannot be mistaken for a button or for MileClear's own mark.
 */
export function PracticeMark({
  initials,
  logoPath,
  src,
  size = 48,
  name,
}: {
  initials: string;
  /** Relative API path from the server (checked logos only). */
  logoPath?: string | null;
  /** A ready URL (object URL of the practice's own upload). */
  src?: string | null;
  size?: number;
  name?: string;
}) {
  const [broken, setBroken] = useState(false);
  const url = src ?? (logoPath ? `${API_BASE}${logoPath}` : null);
  const radius = size >= 52 ? 14 : size >= 48 ? 12 : 8;
  return (
    <span
      className="pc-mark"
      style={{ width: size, height: size, borderRadius: radius, fontSize: Math.round(size * 0.32) }}
      aria-hidden={name ? undefined : true}
      role={name ? "img" : undefined}
      aria-label={name ? `${name} logo` : undefined}
    >
      {url && !broken ? (
        <img src={url} alt="" onError={() => setBroken(true)} />
      ) : (
        initials
      )}
    </span>
  );
}
