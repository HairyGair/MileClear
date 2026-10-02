import type { CSSProperties, ReactNode } from "react";
import { AdminIcon, type AdminIconName } from "./icons";

interface EmptyStateProps {
  title?: string;
  children?: ReactNode;
  icon?: AdminIconName;
  action?: ReactNode;
  compact?: boolean;
}

/** Nothing to show. Say why in plain words, and what would fill it. */
export function EmptyState({ title = "Nothing here yet", children, icon = "inbox", action, compact }: EmptyStateProps) {
  return (
    <div className={`adm-state${compact ? " adm-state--compact" : ""}`}>
      <span className="adm-state__icon"><AdminIcon name={icon} size={compact ? 18 : 22} /></span>
      <p className="adm-state__title">{title}</p>
      {children && <p className="adm-state__text">{children}</p>}
      {action && <div className="adm-state__action">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  /** What failed, in plain words: "Couldn't load the support queue." */
  title?: string;
  /** The raw error message, shown small underneath. */
  message?: string | null;
  onRetry?: () => void;
  compact?: boolean;
}

/** Something failed to load. Always offer a retry when there is one. */
export function ErrorState({ title = "Couldn't load this", message, onRetry, compact }: ErrorStateProps) {
  return (
    <div className={`adm-state adm-state--error${compact ? " adm-state--compact" : ""}`} role="alert">
      <span className="adm-state__icon"><AdminIcon name="alert" size={compact ? 18 : 22} /></span>
      <p className="adm-state__title">{title}</p>
      {message && <p className="adm-state__text">{message}</p>}
      {onRetry && (
        <div className="adm-state__action">
          <button type="button" className="adm-btn adm-btn--sm" onClick={onRetry}>
            <AdminIcon name="refresh" size={14} /> Try again
          </button>
        </div>
      )}
    </div>
  );
}

interface SkeletonProps {
  /** lines: a few text bars. kpi: one KPI card body. chart: a chart area.
   *  table: header plus rows. block: one solid block of `height`. */
  variant?: "lines" | "kpi" | "chart" | "table" | "block";
  rows?: number;
  height?: number | string;
  style?: CSSProperties;
}

/** Placeholder shapes while data loads. Match the shape of what is coming so
 *  the page does not jump when it arrives. */
export function LoadingSkeleton({ variant = "lines", rows = 3, height, style }: SkeletonProps) {
  if (variant === "block") {
    return <div className="adm-skel" style={{ height: height ?? 120, ...style }} aria-hidden="true" />;
  }
  if (variant === "kpi") {
    return (
      <div className="adm-skel-group" aria-hidden="true" style={style}>
        <div className="adm-skel" style={{ width: "45%", height: 12 }} />
        <div className="adm-skel" style={{ width: "60%", height: 30, marginTop: 12 }} />
        <div className="adm-skel" style={{ width: "35%", height: 12, marginTop: 12 }} />
      </div>
    );
  }
  if (variant === "chart") {
    return (
      <div className="adm-skel-chart" aria-hidden="true" style={{ height: height ?? 220, ...style }}>
        {Array.from({ length: 18 }, (_, i) => (
          <div key={i} className="adm-skel" style={{ height: `${30 + ((i * 37) % 60)}%` }} />
        ))}
      </div>
    );
  }
  if (variant === "table") {
    return (
      <div className="adm-skel-group" aria-hidden="true" style={style}>
        <div className="adm-skel" style={{ height: 14, width: "100%" }} />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="adm-skel" style={{ height: 28, width: "100%", marginTop: 10, opacity: 1 - i * 0.08 }} />
        ))}
      </div>
    );
  }
  return (
    <div className="adm-skel-group" aria-hidden="true" style={style}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="adm-skel" style={{ height: 12, width: `${90 - ((i * 23) % 40)}%`, marginTop: i ? 10 : 0 }} />
      ))}
    </div>
  );
}

interface LoadStateProps<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  /** Plain-words failure line, e.g. "Couldn't load the QR scans." */
  errorTitle?: string;
  skeleton?: ReactNode;
  children: (data: T) => ReactNode;
}

/** The loading / error / ready switch every panel needs, in one place. */
export function LoadState<T>({ data, loading, error, onRetry, errorTitle, skeleton, children }: LoadStateProps<T>) {
  if (error && !data) return <ErrorState compact title={errorTitle} message={error} onRetry={onRetry} />;
  if (loading && !data) return <>{skeleton ?? <LoadingSkeleton />}</>;
  if (!data) return null;
  return <>{children(data)}</>;
}
