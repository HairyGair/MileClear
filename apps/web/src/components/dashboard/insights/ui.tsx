"use client";

import { Component, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { Card, CardError, Skeleton } from "../kit";
import s from "./insights.module.css";

/** The loading shape of a card. */
export function CardLoading({ title }: { title?: string }) {
  return (
    <Card title={title} aria-busy="true">
      <Skeleton variant="text" count={3} />
    </Card>
  );
}

/** A card that failed to load: one line, with Try again. */
export function CardFailed({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <Card title={title}>
      <CardError onRetry={onRetry} />
    </Card>
  );
}

export function Takeaway({ children }: { children: ReactNode }) {
  return <p className={s.takeaway}>{children}</p>;
}

export function Progress({ percent, label }: { percent: number; label: string }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className={s.progress} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p)}>
      <div className={s.progressFill} style={{ width: `${p}%` }} />
    </div>
  );
}

export function Row({ main, sub, figure }: { main: ReactNode; sub?: ReactNode; figure?: ReactNode }) {
  return (
    <div className={s.row}>
      <span className={s.rowMain}>
        <span>{main}</span>
        {sub && <span className={s.rowSub}>{sub}</span>}
      </span>
      {figure !== undefined && <span className={s.rowFig}>{figure}</span>}
    </div>
  );
}

/** Whole pounds for big money figures, pence for small ones. */
export function pounds(pence: number): string {
  const v = (Number.isFinite(pence) ? pence : 0) / 100;
  return `£${v.toLocaleString("en-GB", { minimumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2, maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 })}`;
}

export function miles(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  return `${n.toLocaleString("en-GB", { maximumFractionDigits: n < 100 ? 1 : 0 })} mi`;
}

export const DAYS_MON_FIRST = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

class CardBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // A card never takes the page down. It shows one quiet line instead.
  }
  render() {
    if (this.state.failed) return <p className={s.note}>Couldn&apos;t load this.</p>;
    return this.props.children;
  }
}

/** Wrap a Home card so a bad response can never crash the page: it shows "Couldn't load this." instead. */
export function withBoundary<P extends object>(Inner: ComponentType<P>): ComponentType<P> {
  function Guarded(props: P) {
    return (
      <CardBoundary>
        <Inner {...props} />
      </CardBoundary>
    );
  }
  Guarded.displayName = `Guarded(${Inner.displayName ?? Inner.name})`;
  return Guarded;
}
