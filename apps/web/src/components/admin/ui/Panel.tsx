import type { ReactNode } from "react";
import Link from "next/link";
import { AdminIcon } from "./icons";

interface PanelProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Buttons, tabs or a small control at the top right. */
  actions?: ReactNode;
  /** Adds a "View all" style link at the top right. */
  href?: string;
  hrefLabel?: string;
  footer?: ReactNode;
  children: ReactNode;
  /** No inner padding: for a table or chart that should run edge to edge. */
  flush?: boolean;
  /** Draws the amber edge used for the one panel a page is about. */
  highlight?: boolean;
  className?: string;
  id?: string;
}

/** The card every admin section sits in. Title on the left, actions on the
 *  right, body underneath. */
export function Panel({ title, subtitle, actions, href, hrefLabel = "View all", footer, children, flush, highlight, className = "", id }: PanelProps) {
  const hasHead = title || subtitle || actions || href;
  return (
    <section
      id={id}
      className={`adm-panel${flush ? " adm-panel--flush" : ""}${highlight ? " adm-panel--highlight" : ""} ${className}`.trim()}
    >
      {hasHead && (
        <header className="adm-panel__head">
          <div className="adm-panel__titles">
            {title && <h2 className="adm-panel__title">{title}</h2>}
            {subtitle && <p className="adm-panel__subtitle">{subtitle}</p>}
          </div>
          {(actions || href) && (
            <div className="adm-panel__actions">
              {actions}
              {href && (
                <Link href={href} className="adm-link-arrow">
                  {hrefLabel}
                  <AdminIcon name="arrowRight" size={14} />
                </Link>
              )}
            </div>
          )}
        </header>
      )}
      <div className="adm-panel__body">{children}</div>
      {footer && <footer className="adm-panel__foot">{footer}</footer>}
    </section>
  );
}

/** Same thing under the name the brief uses. */
export const Card = Panel;

interface GridProps {
  children: ReactNode;
  /** Minimum column width; columns wrap to fit. */
  min?: number;
  gap?: "sm" | "md";
  className?: string;
}

/** Responsive grid for KPI rows and panel rows. */
export function Grid({ children, min = 220, gap = "md", className = "" }: GridProps) {
  return (
    <div
      className={`adm-grid adm-grid--${gap} ${className}`.trim()}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))` }}
    >
      {children}
    </div>
  );
}

interface StatLineProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
}

/** A label/value row for compact lists inside a panel. */
export function StatLine({ label, value, hint }: StatLineProps) {
  return (
    <div className="adm-statline">
      <span className="adm-statline__label">
        {label}
        {hint && <span className="adm-statline__hint">{hint}</span>}
      </span>
      <span className="adm-statline__value">{value}</span>
    </div>
  );
}
