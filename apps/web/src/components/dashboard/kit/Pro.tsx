"use client";

import type { ReactNode } from "react";
import { useMe } from "../../../lib/dashboard/useMe";
import { planHref, proReasonTitle, type ProReason } from "../../../lib/dashboard/proReasons";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { cx } from "./cx";

/** Pale amber "PRO" badge. Renders nothing for Pro drivers (Pro users never see PRO chips). */
export function ProChip({ className }: { className?: string }) {
  const { isPro } = useMe();
  if (isPro) return null;
  return <span className={cx("mc-pro", className)}>PRO</span>;
}

/**
 * Wrap Pro-only content. Pro drivers see `children`. Free drivers see a teaser
 * with an "Upgrade to Pro" link to /dashboard/settings/plan?reason=<reason>.
 *
 *   <ProGate reason="trends" teaser={<p>Your weekly trends.</p>}><Trends /></ProGate>
 *
 * `inline` renders a single compact line (for a gated row or button area).
 * `page` renders the full-page gate with the one amber button (use when the
 * gate is the page's only content).
 */
export function ProGate({
  reason,
  children,
  teaser,
  inline = false,
  page = false,
}: {
  reason: ProReason;
  children: ReactNode;
  teaser?: ReactNode;
  inline?: boolean;
  page?: boolean;
}) {
  const { isPro } = useMe();
  if (isPro) return <>{children}</>;

  const href = planHref(reason);
  const title = proReasonTitle(reason);

  if (inline) {
    return (
      <div className="mc-progate mc-progate--inline">
        <span className="mc-progate__text">{teaser ?? title}</span>
        <span className="mc-pro">PRO</span>
        <Button variant="link" href={href} size="sm">
          Upgrade to Pro
        </Button>
      </div>
    );
  }

  if (page) {
    return (
      <div className="mc-progate mc-progate--page">
        <span className="mc-progate__icon" aria-hidden="true">
          <Icon name="lock-closed-outline" size={36} />
        </span>
        <h2 className="mc-progate__title">{title}</h2>
        <p className="mc-progate__body">This is part of MileClear Pro. £4.99 a month, cancel any time.</p>
        {teaser && <div className="mc-progate__teaser">{teaser}</div>}
        <Button variant="primary" href={href}>
          Upgrade to Pro
        </Button>
      </div>
    );
  }

  return (
    <section className="mc-card mc-progate mc-progate--card">
      <div className="mc-card__head">
        <h2 className="mc-card__title">{title}</h2>
        <span className="mc-pro">PRO</span>
      </div>
      {teaser && <div className="mc-progate__teaser">{teaser}</div>}
      <p className="mc-progate__body">This is part of MileClear Pro. £4.99 a month, cancel any time.</p>
      <Button variant="link" href={href}>
        Upgrade to Pro
      </Button>
    </section>
  );
}
