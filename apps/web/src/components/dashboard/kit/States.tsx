import type { CardAction } from "./Card";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { cx } from "./cx";

function ActionButton({ action, primary }: { action: CardAction; primary: boolean }) {
  return (
    <Button
      variant={primary ? "primary" : "link"}
      href={action.href}
      onClick={action.onClick}
      size={primary ? "md" : "sm"}
    >
      {action.label}
    </Button>
  );
}

/**
 * Says what is missing and what to do. Never shows £0.00 or blank tables.
 * size "screen" (default) is a whole-area state with one primary button;
 * size "card" is the small version with a text link.
 *
 *   <EmptyState icon="car-outline" title="Add your vehicle" body="..." action={{ label: "Add vehicle", href: "/dashboard/vehicles/new" }} />
 */
export function EmptyState({
  icon = "file-tray-full-outline",
  title,
  body,
  action,
  size = "screen",
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: CardAction;
  size?: "screen" | "card";
}) {
  return (
    <div className={cx("mc-empty", `mc-empty--${size}`)}>
      <span className="mc-empty__icon" aria-hidden="true">
        <Icon name={icon} size={size === "screen" ? 36 : 24} />
      </span>
      <h2 className="mc-empty__title">{title}</h2>
      {body && <p className="mc-empty__body">{body}</p>}
      {action && <ActionButton action={action} primary={size === "screen"} />}
    </div>
  );
}

/**
 * A load failure, shown in the area that failed.
 *
 *   <ErrorState title="Couldn't load your trips" onRetry={reload} />
 */
export function ErrorState({
  title,
  body = "Check your connection and try again.",
  onRetry,
  size = "screen",
}: {
  title: string;
  body?: string;
  onRetry?: () => void;
  size?: "screen" | "card";
}) {
  return (
    <div className={cx("mc-empty", `mc-empty--${size}`)} role="alert">
      <span className="mc-empty__icon" aria-hidden="true">
        <Icon name="cloud-offline-outline" size={size === "screen" ? 36 : 24} />
      </span>
      <h2 className="mc-empty__title">{title}</h2>
      {body && <p className="mc-empty__body">{body}</p>}
      {onRetry && (
        <Button variant={size === "screen" ? "secondary" : "link"} size={size === "screen" ? "md" : "sm"} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** One-line "Couldn't load this" for inside a Home card. */
export function CardError({ onRetry }: { onRetry?: () => void }) {
  return (
    <p className="mc-cardError">
      Couldn&apos;t load this.{" "}
      {onRetry && (
        <button type="button" className="mc-textlink" onClick={onRetry}>
          Try again
        </button>
      )}
    </p>
  );
}

/**
 * Loading placeholders shaped like the content. They fade in after 150ms so
 * quick loads don't flash.
 *
 *   <Skeleton variant="row" count={6} />
 */
export function Skeleton({
  variant,
  count = 1,
  height,
}: {
  variant: "figure" | "row" | "card" | "text";
  count?: number;
  height?: number;
}) {
  const items = Array.from({ length: count });
  return (
    <div className={cx("mc-skel", `mc-skel--${variant}`)} aria-busy="true" role="status">
      <span className="mc-sr-only">Loading</span>
      {items.map((_, i) => (
        <div key={i} className="mc-skel__item" style={height ? { height } : undefined}>
          {variant === "row" && (
            <>
              <span className="mc-skel__tile" />
              <span className="mc-skel__lines">
                <span className="mc-skel__line" />
                <span className="mc-skel__line mc-skel__line--short" />
              </span>
              <span className="mc-skel__fig" />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

