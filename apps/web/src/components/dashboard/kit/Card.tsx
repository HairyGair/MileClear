import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";

export interface CardAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

/** A link-styled action (amber text). Used in card headers and section headers. */
export function ActionLink({ action }: { action: CardAction }) {
  if (action.href) {
    return (
      <Link href={action.href} className="mc-textlink" onClick={action.onClick}>
        {action.label}
      </Link>
    );
  }
  return (
    <button type="button" className="mc-textlink" onClick={action.onClick}>
      {action.label}
    </button>
  );
}

/**
 * Surface container.
 *
 *   <Card title="This week" action={{ label: "See all", href: "/dashboard/trips" }}>...</Card>
 *
 * padded={false} makes the card flush, for lists and tables that run edge to edge.
 */
export function Card({
  title,
  action,
  tone = "default",
  padded = true,
  footer,
  className,
  children,
  ...rest
}: {
  title?: string;
  action?: CardAction;
  tone?: "default" | "quiet" | "amber";
  padded?: boolean;
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "title">) {
  return (
    <section
      className={cx("mc-card", !padded && "mc-card--flush", tone === "quiet" && "mc-card--recessed", tone === "amber" && "mc-card--amber", className)}
      {...rest}
    >
      {(title || action) && (
        <div className={cx("mc-card__head", !padded && "mc-card__head--padded")}>
          {title && <h2 className="mc-card__title">{title}</h2>}
          {action && <ActionLink action={action} />}
        </div>
      )}
      {children}
      {footer && <div className="mc-card__footer">{footer}</div>}
    </section>
  );
}

/** Section title above a block of content: 16/700, optional link on the right. */
export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: CardAction;
}) {
  return (
    <div className="mc-sectionhead">
      <div>
        <h2 className="mc-sectionhead__title">{title}</h2>
        {subtitle && <p className="mc-sectionhead__sub">{subtitle}</p>}
      </div>
      {action && <ActionLink action={action} />}
    </div>
  );
}
