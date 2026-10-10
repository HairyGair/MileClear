"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { TourEnd } from "../../../lib/dashboard/tour";
import { Button } from "../kit/Button";
import { lockScroll, unlockScroll } from "../kit/scrollLock";
import { resolveTarget } from "./dom";
import { placeCard, ringRect, type Rect } from "./position";
import { tripsBody, type StepId, type TourCtx, type TourStep } from "./steps";
import "./tour.css";

export interface TourEndInfo {
  kind: TourEnd;
  atStep: number;
  stepId: StepId;
  total: number;
}

interface Geo {
  ring: Rect;
  blank: boolean;
  card: { left: number; top: number } | null;
}

const PHONE_QUERY = "(max-width: 767px)";
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The tour dialog: a dimmed page with a ring round the target and a card.
 * Native <dialog>: focus trap, Esc and an inert page come with showModal().
 */
export function Tour({
  steps,
  ctx,
  unclassified,
  returnFocus,
  onEnd,
}: {
  steps: TourStep[];
  ctx: TourCtx;
  /** Live Trips badge count, so the Trips stop never disagrees with the badge. */
  unclassified: number;
  returnFocus: HTMLElement | null;
  onEnd: (info: TourEndInfo) => void;
}) {
  const [list, setList] = useState(steps);
  const [idx, setIdx] = useState(0);
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE_QUERY).matches);
  const [geo, setGeo] = useState<Geo | null>(null);

  const dlg = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const dir = useRef(1);
  const ended = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const frame = useRef(0);

  const total = list.length;
  const step = list[Math.min(idx, total - 1)];
  const last = idx >= total - 1;
  const opening = step.id === "opening";

  // Open as a modal; remember where focus was.
  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    opener.current = returnFocus ?? (document.activeElement as HTMLElement | null);
    if (!d.open) d.showModal();
    lockScroll();
    return () => {
      unlockScroll();
      if (d.open) d.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    const on = () => setPhone(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const dropCurrent = useCallback(() => {
    setList((l) => (l.length <= 1 ? l : l.filter((_, i) => i !== idx)));
    if (dir.current < 0) setIdx((i) => Math.max(0, i - 1));
    else setIdx((i) => Math.min(i, list.length - 2));
  }, [idx, list.length]);

  const compute = useCallback(() => {
    const c = card.current;
    if (!c) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const size = { w: c.offsetWidth, h: c.offsetHeight };

    if (step.id === "opening") {
      setGeo({
        ring: { top: vh / 2, left: vw / 2, width: 0, height: 0 },
        blank: true,
        card: phone ? null : { left: Math.round((vw - size.w) / 2), top: Math.round((vh - size.h) / 2) },
      });
      return;
    }
    const el = resolveTarget(step.target);
    if (!el) {
      dropCurrent();
      return;
    }
    const r = el.getBoundingClientRect();
    const target: Rect = { top: r.top, left: r.left, width: r.width, height: r.height };

    if (phone) {
      let clip: { top: number; bottom: number } | undefined;
      if (step.page) {
        const bar = document.querySelector(".mc-topbar")?.getBoundingClientRect().bottom ?? 0;
        clip = { top: bar, bottom: c.getBoundingClientRect().top - 8 };
      }
      setGeo({ ring: ringRect(target, step.pad, clip), blank: false, card: null });
      return;
    }
    const ring = ringRect(target, step.pad);
    const side = step.side === "center" ? "below" : step.side;
    const p = placeCard(ring, size, { w: vw, h: vh }, side, step.align, { minRoom: step.id === "home" ? 260 : 0 });
    setGeo({ ring, blank: false, card: { left: Math.round(p.left), top: Math.round(p.top) } });
  }, [step, phone, dropCurrent]);

  const schedule = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      compute();
    });
  }, [compute]);

  // New step: scroll a page target into view, position, move focus to the title.
  useLayoutEffect(() => {
    if (step.page) {
      const el = resolveTarget(step.target);
      if (el) {
        const r = el.getBoundingClientRect();
        const bar = document.querySelector(".mc-topbar")?.getBoundingClientRect().bottom ?? 0;
        const behavior = reduced() ? "auto" : "smooth";
        if (phone) {
          const delta = r.top - (bar + 12);
          if (Math.abs(delta) > 2) window.scrollBy({ top: delta, behavior });
        } else if (r.top < bar + 8 || r.bottom > window.innerHeight - 16) {
          el.scrollIntoView({ block: "center", behavior });
        }
      }
    } else if (step.id !== "opening") {
      // Top bar, rail and tab bar targets must be on screen: bring the page back to the top if needed.
      const el = resolveTarget(step.target);
      const r = el?.getBoundingClientRect();
      if (r && (r.bottom <= 0 || r.top >= window.innerHeight)) window.scrollTo({ top: 0, behavior: "auto" });
    }
    compute();
    const t = window.setTimeout(compute, 350);
    return () => window.clearTimeout(t);
  }, [step, compute, phone]);

  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, [step.id]);

  // Follow the target.
  useEffect(() => {
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.visualViewport?.addEventListener("resize", schedule);
    const ro = new ResizeObserver(schedule);
    const el = step.id === "opening" ? null : resolveTarget(step.target);
    if (el) ro.observe(el);
    if (card.current) ro.observe(card.current);
    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.visualViewport?.removeEventListener("resize", schedule);
      ro.disconnect();
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [step, schedule]);

  const finish = useCallback(
    (kind: TourEnd) => {
      if (ended.current) return;
      ended.current = true;
      const d = dlg.current;
      if (d?.open) d.close();
      unlockScroll();
      const back = opener.current;
      const usable = back && back !== document.body && document.contains(back) && !(back as HTMLButtonElement).disabled;
      (usable ? back : document.getElementById("main-content"))?.focus({ preventScroll: true });
      onEnd({ kind, atStep: idx + 1, stepId: step.id, total });
    },
    [idx, step.id, total, onEnd]
  );

  const next = () => {
    if (last) return finish("done");
    dir.current = 1;
    setIdx((i) => i + 1);
  };
  const back = () => {
    if (idx === 0) return;
    dir.current = -1;
    setIdx((i) => i - 1);
  };

  function onKeyDown(e: KeyboardEvent<HTMLDialogElement>) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      back();
    } else if (e.key === "Tab") {
      const els = Array.from(card.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []).filter(
        (b) => getComputedStyle(b).visibility !== "hidden"
      );
      if (els.length === 0) return;
      const i = els.indexOf(document.activeElement as HTMLElement);
      const n = i === -1 ? (e.shiftKey ? els.length - 1 : 0) : (i + (e.shiftKey ? -1 : 1) + els.length) % els.length;
      e.preventDefault();
      els[n].focus();
    }
  }

  const body = step.id === "trips" ? tripsBody(ctx.baseMode, unclassified) : step.body;
  const n = idx + 1;
  const ringStyle: CSSProperties | undefined = geo
    ? {
        top: geo.ring.top,
        left: geo.ring.left,
        width: geo.ring.width,
        height: geo.ring.height,
        borderRadius: step.shape === "circle" ? "50%" : step.shape === "pill" ? "var(--mc-r-pill)" : "var(--mc-r-md)",
      }
    : undefined;
  const cardStyle: CSSProperties | undefined = !phone && geo?.card ? { left: geo.card.left, top: geo.card.top } : undefined;

  return (
    <dialog
      ref={dlg}
      className="mc-tour"
      aria-labelledby="mc-tour-title"
      aria-describedby="mc-tour-body"
      onCancel={(e) => {
        e.preventDefault();
        finish("skipped");
      }}
      onKeyDown={onKeyDown}
    >
      <div className={`mc-tour__ring${geo?.blank ? " is-blank" : ""}`} style={ringStyle} aria-hidden="true" />
      <div
        ref={card}
        className={`mc-tour__card${phone ? " is-docked" : ""}${opening ? " is-opening" : ""}${geo ? " is-placed" : ""}`}
        style={cardStyle}
      >
        <div key={step.id} className="mc-tour__inner">
          <div className="mc-tour__top">
            <span className="mc-tour__count" aria-hidden="true">
              {n} of {total}
            </span>
            {!last && (
              <button type="button" className="mc-tour__skip" onClick={() => finish("skipped")}>
                Skip tour
              </button>
            )}
          </div>
          <h2 id="mc-tour-title" ref={title} tabIndex={-1} className="mc-tour__title">
            <span className="mc-sr-only">
              Step {n} of {total}:{" "}
            </span>
            <span className="mc-tour__title-text">{step.title}</span>
          </h2>
          <p id="mc-tour-body" className="mc-tour__body">
            <span className="mc-tour__body-text">{body}</span>
            {step.srWhere && <span className="mc-sr-only"> {step.srWhere}</span>}
          </p>
        </div>
        <div className="mc-tour__foot">
          <Button variant="ghost" onClick={back} style={{ visibility: idx === 0 ? "hidden" : "visible" }}>
            Back
          </Button>
          <Button variant="primary" onClick={next}>
            {opening ? "Show me around" : last ? "Done" : "Next"}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
