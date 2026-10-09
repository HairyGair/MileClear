"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { usePageMeta } from "../shell/pageMeta";

/**
 * Every page starts with this. The title and back link appear in the shell's
 * top bar (the page's one h1) and set the browser tab to "<Title> · MileClear".
 * `primary` (one amber button) and `secondary` sit in a row at the top of the
 * content; `children` is the under-title line.
 *
 *   <PageHeader title="Trips" primary={<Button variant="primary" href="/dashboard/trips/new">Add a trip</Button>} />
 */
export function PageHeader({
  title,
  docTitle,
  back,
  primary,
  secondary,
  children,
}: {
  title: string;
  /** Tab title, when it should differ from `title` (e.g. Home's greeting). */
  docTitle?: string;
  back?: { href: string; label: string };
  primary?: ReactNode;
  secondary?: ReactNode;
  children?: ReactNode;
}) {
  const { setMeta } = usePageMeta();
  const backHref = back?.href;
  const backLabel = back?.label;

  useLayoutEffect(() => {
    setMeta({ title, docTitle, back: backHref ? { href: backHref, label: backLabel ?? "Back" } : undefined });
    document.title = `${docTitle ?? title} · MileClear`;
  }, [title, docTitle, backHref, backLabel, setMeta]);

  if (!primary && !secondary && !children) return null;
  return (
    <div className="mc-pagehead">
      {children && <div className="mc-pagehead__line">{children}</div>}
      {(primary || secondary) && (
        <div className="mc-pagehead__actions">
          {secondary}
          {primary}
        </div>
      )}
    </div>
  );
}
