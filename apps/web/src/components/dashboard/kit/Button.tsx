import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { cx } from "./cx";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "destructive" | "link";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  /** Renders a link instead of a button. */
  href?: string;
  /** Opens in a new tab (links only). */
  external?: boolean;
  icon?: IconName;
  fullWidth?: boolean;
  children?: ReactNode;
}

/**
 * One amber (primary) button per view. Everything else is secondary, ghost or link.
 *
 *   <Button variant="primary" href="/dashboard/trips/new">Add a trip</Button>
 *   <Button variant="secondary" loading={saving} onClick={save}>Save</Button>
 */
export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  href,
  external,
  icon,
  fullWidth,
  className,
  children,
  disabled,
  type,
  ...rest
}: ButtonProps) {
  const classes = cx(
    "mc-btn",
    `mc-btn--${variant}`,
    `mc-btn--${size}`,
    fullWidth && "mc-btn--full",
    loading && "is-loading",
    className
  );
  const content = (
    <>
      {icon && <Icon name={icon} size={size === "sm" ? 16 : size === "lg" ? 20 : 18} />}
      {children != null && <span className="mc-btn__label">{children}</span>}
      {variant === "link" && !icon && <Icon name="chevron-forward" size={14} />}
      {loading && <span className="mc-spinner" aria-hidden="true" />}
    </>
  );

  if (href && !disabled) {
    const anchorProps = {
      className: classes,
      "aria-busy": loading || undefined,
      "aria-label": rest["aria-label"],
      title: rest.title,
      id: rest.id,
      onClick: rest.onClick as unknown as React.MouseEventHandler<HTMLAnchorElement> | undefined,
      "data-testid": (rest as Record<string, unknown>)["data-testid"] as string | undefined,
    };
    if (external) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" {...anchorProps}>
          {content}
        </a>
      );
    }
    return (
      <Link href={href} {...anchorProps}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type ?? "button"}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {content}
    </button>
  );
}
