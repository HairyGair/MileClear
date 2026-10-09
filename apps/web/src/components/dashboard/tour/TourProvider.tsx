"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../../../lib/api";
import { useMe, useUnclassifiedCount } from "../../../lib/dashboard/useMe";
import { isExistingAccount, readTourState, shouldAutoStart, writeTourState } from "../../../lib/dashboard/tour";
import { detectHomeKind, homeSettled, resolveTarget, somethingOpen } from "./dom";
import { buildTourSteps, type TourCtx, type TourStep } from "./steps";
import type { TourEndInfo } from "./Tour";

// Loaded only when a tour is going to run, so returning drivers download nothing extra.
const Tour = dynamic(() => import("./Tour").then((m) => m.Tour), { ssr: false });

type Trigger = "auto" | "replay";

interface Run {
  trigger: Trigger;
  steps: TourStep[];
  ctx: TourCtx;
  returnFocus: HTMLElement | null;
}

interface TourApi {
  /** Avatar menu item: start here on Home, otherwise go to Home with ?tour=1. */
  startFromMenu: () => void;
}

const TourContext = createContext<TourApi>({ startFromMenu: () => {} });
export function useTour(): TourApi {
  return useContext(TourContext);
}

function track(type: string, metadata: Record<string, unknown>) {
  // Fire and forget: the tour never waits on analytics.
  try {
    api.post("/user/event", { type, metadata }).catch(() => {});
  } catch {
    // ignore
  }
}

const POLL_MS = 100;
const GIVE_UP_MS = 10_000;
const SETTLE_MS = 2_500;

export function TourProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const me = useMe();
  const { count } = useUnclassifiedCount();
  const userId = me.user?.id ?? null;

  const [run, setRun] = useState<Run | null>(null);
  const [announce, setAnnounce] = useState("");
  const [kick, setKick] = useState(0);
  const busy = useRef(false);

  const meRef = useRef(me);
  meRef.current = me;
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const begin = useCallback(
    (trigger: Trigger, returnFocus: HTMLElement | null) => {
      const m = meRef.current;
      if (!m.user) {
        busy.current = false;
        return;
      }
      const ctx: TourCtx = {
        mode: m.mode,
        baseMode: m.baseMode,
        isCompanyDriver: m.isCompanyDriver,
        isGigDriver: m.isGigDriver,
        isEmployee: m.isEmployee,
        workType: (m.user.workType ?? null) as string | null,
        unclassified: 0,
        existingAccount: isExistingAccount(m.user.createdAt as unknown as string | undefined),
        homeKind: detectHomeKind(m.mode),
      };
      const steps = buildTourSteps(ctx).filter((s) => s.id === "opening" || resolveTarget(s.target) !== null);
      if (trigger === "auto") {
        const st = readTourState(m.user.id);
        writeTourState(m.user.id, { autoStarts: st.autoStarts + 1 });
      }
      track("web_tour.started", {
        trigger,
        variant: ctx.existingAccount ? "existing" : "new",
        mode: ctx.mode,
        steps: steps.length,
      });
      setRun({ trigger, steps, ctx, returnFocus });
    },
    []
  );

  /** Waits until Home is ready and nothing is open, then starts. Returns a cancel function. */
  const launch = useCallback(
    (trigger: Trigger, returnFocus: HTMLElement | null = null): (() => void) | null => {
      if (busy.current) return null;
      busy.current = true;
      const t0 = Date.now();
      let settleFrom: number | null = null;
      let stopped = false;
      const timer = window.setInterval(() => {
        const now = Date.now();
        if (stopped) return;
        if (now - t0 > GIVE_UP_MS) {
          stop();
          return;
        }
        if (document.visibilityState !== "visible" || somethingOpen()) {
          settleFrom = null;
          return;
        }
        if (settleFrom === null) settleFrom = now;
        if (homeSettled() || now - settleFrom >= SETTLE_MS) {
          window.clearInterval(timer);
          stopped = true;
          if (trigger === "auto" && meRef.current.user && !shouldAutoStart(readTourState(meRef.current.user.id))) {
            busy.current = false;
            return;
          }
          begin(trigger, returnFocus);
        }
      }, POLL_MS);
      function stop() {
        stopped = true;
        window.clearInterval(timer);
        busy.current = false;
      }
      return () => {
        if (!stopped) stop();
      };
    },
    [begin]
  );

  const ready = !!userId && me.teamReady;

  // Automatic first-visit start (section 1.1).
  useEffect(() => {
    if (!ready || !userId) return;
    if (pathname !== "/dashboard" || pathname.startsWith("/dashboard/admin")) return;
    if (new URLSearchParams(window.location.search).get("tour") === "1") return;
    if (window.innerWidth < 320 || window.matchMedia("print").matches) return;
    if (!shouldAutoStart(readTourState(userId))) return;
    return launch("auto") ?? undefined;
  }, [ready, userId, pathname, kick, launch]);

  // Replay by link: /dashboard?tour=1 (Help page, or the menu from another page).
  useEffect(() => {
    if (!ready || pathname !== "/dashboard") return;
    if (new URLSearchParams(window.location.search).get("tour") !== "1") return;
    router.replace("/dashboard");
    return launch("replay") ?? undefined;
  }, [ready, pathname, launch, router]);

  // A Home tab opened in the background waits until it is shown.
  useEffect(() => {
    const on = () => {
      if (document.visibilityState === "visible") setKick((k) => k + 1);
    };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  const onEnd = useCallback(
    (info: TourEndInfo) => {
      const m = meRef.current;
      const current = run;
      busy.current = false;
      setRun(null);
      if (m.user && current) {
        const st = readTourState(m.user.id);
        // Replay never changes a stored done or skipped, only refreshes `at`.
        const keep = current.trigger === "replay" && st.state !== null;
        writeTourState(m.user.id, keep ? {} : { state: info.kind });
        if (info.kind === "done") track("web_tour.completed", { trigger: current.trigger, steps: info.total });
        else track("web_tour.skipped", { trigger: current.trigger, atStep: info.atStep, stepId: info.stepId });
      }
      setAnnounce(info.kind === "done" ? "Tour finished." : "Tour closed.");
      window.setTimeout(() => setAnnounce(""), 1000);
    },
    [run]
  );

  const api2 = useMemo<TourApi>(
    () => ({
      startFromMenu: () => {
        if (pathRef.current === "/dashboard") {
          const btn = document.querySelector<HTMLElement>(".mc-menu__trigger.mc-avatar");
          launch("replay", btn);
        } else {
          router.push("/dashboard?tour=1");
        }
      },
    }),
    [launch, router]
  );

  return (
    <TourContext.Provider value={api2}>
      {children}
      <div className="mc-sr-only" aria-live="polite">
        {announce}
      </div>
      {run && <Tour steps={run.steps} ctx={run.ctx} unclassified={count} returnFocus={run.returnFocus} onEnd={onEnd} />}
    </TourContext.Provider>
  );
}
