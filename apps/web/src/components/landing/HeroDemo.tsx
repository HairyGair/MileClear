"use client";

// The hero is the app's Home screen (Work mode, the Oct 2026 "calm list"
// layout) playing one real drive: the status line notices you set off, the
// trip card draws the route with the car on it while the miles count up, the
// trip saves itself at the kerb, and the one tap the app asks of a driver,
// Business or Personal, is the visitor's to make. Business sends the trip's
// claim up into the year's figure; Personal claims nothing.
//
// Nothing jumps: the screen is one fixed-size phone, sized in em from its
// own width (container query units), and every change is a cross-fade or a
// slide inside a slot that keeps its height. The claim never resets between
// loops either; each drive adds to it, the way the real figure grows.
//
// Motion is opt in twice over: it only plays while the phone is on screen in
// a visible tab, and reduced motion holds the finished frame with nothing
// moving. Without JavaScript the first frame renders on the server.

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { HERO_ROUTE } from "@/data/heroRoute";
import "./hero-demo.css";

type Step = "idle" | "detected" | "recording" | "arrived" | "sorted" | "rest";

/** The real drive in data/heroRoute.ts, priced at the 2026-27 AMAP rate. */
const TRIP_MILES = HERO_ROUTE.miles;
const TRIP_SECONDS = HERO_ROUTE.seconds;
const AMAP_RATE = 0.55;
const CLAIM_START = 39.72;
const TRIP_CLAIM = Math.round(TRIP_MILES * AMAP_RATE * 100) / 100;

/** How long each step lasts before the next, in ms. Arrived waits for a tap. */
const BEATS: Record<Step, number> = {
  idle: 2600,
  detected: 1300,
  recording: 6400,
  arrived: 5200,
  sorted: 3600,
  rest: 2200,
};
const ORDER: Step[] = ["idle", "detected", "recording", "arrived", "sorted", "rest"];

const clock = (totalSeconds: number) => {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};
const money = (n: number) => `£${n.toFixed(2)}`;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export default function HeroDemo() {
  const [step, setStep] = useState<Step>("idle");
  const [progress, setProgress] = useState(0);
  const [claim, setClaim] = useState(CLAIM_START);
  const [choice, setChoice] = useState<"business" | "personal" | null>(null);
  const [trips, setTrips] = useState(19);
  /** The trip card's resting state: a morning trip, then the drive just played. */
  const [lastTrip, setLastTrip] = useState<{ when: string; miles: number; route: string; as: "business" | "personal"; real: boolean }>({
    when: "Today 08:12",
    miles: 4.2,
    route: "Home to Gosforth",
    as: "business",
    real: false,
  });
  const [playing, setPlaying] = useState(false);
  const [held, setHeld] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const tilt = useRef<HTMLDivElement>(null);
  const routeRef = useRef<SVGPathElement>(null);
  const carRef = useRef<SVGGElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const claimFrom = useRef(CLAIM_START);

  const recording = step === "recording";
  const saved = step === "arrived" || step === "sorted";
  const miles = TRIP_MILES * progress;
  const seconds = TRIP_SECONDS * progress;

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setHeld(motion.matches);
    apply();
    motion.addEventListener("change", apply);
    return () => motion.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (held || !root.current) return;
    const el = root.current;
    const io = new IntersectionObserver(
      ([entry]) => setPlaying(entry.isIntersecting && document.visibilityState === "visible"),
      { threshold: 0.3 }
    );
    io.observe(el);
    const onVisibility = () => {
      if (document.visibilityState !== "visible") setPlaying(false);
      else {
        const r = el.getBoundingClientRect();
        setPlaying(r.bottom > 0 && r.top < window.innerHeight);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [held]);

  const go = useCallback((next: Step) => {
    setStep(next);
    if (next === "idle") {
      setProgress(0);
      setChoice(null);
    }
  }, []);

  // The beat clock. Arrived falls through to Business if nobody taps.
  useEffect(() => {
    if (!playing || held) return;
    const next = ORDER[(ORDER.indexOf(step) + 1) % ORDER.length];
    timer.current = setTimeout(() => {
      if (step === "arrived") {
        setChoice((c) => c ?? "business");
      }
      go(next);
    }, BEATS[step]);
    return () => clearTimeout(timer.current);
  }, [step, playing, held, go]);

  // The drive: one eased progress value moves the line, the car and the counters.
  useEffect(() => {
    if (step !== "recording" || held) return;
    const started = performance.now();
    let frame = 0;
    const run = (now: number) => {
      const t = Math.min(1, (now - started) / BEATS.recording);
      setProgress(easeInOut(t));
      if (t < 1) frame = requestAnimationFrame(run);
    };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, [step, held]);

  // Keep the car on the line. Reads the drawn path, so it can never drift off it.
  useEffect(() => {
    const path = routeRef.current;
    const car = carRef.current;
    if (!path || !car) return;
    const total = path.getTotalLength();
    const p = path.getPointAtLength(total * progress);
    car.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
  }, [progress]);

  // The trip is saved: count it, and for Business add its claim to the year.
  useEffect(() => {
    if (step !== "sorted") return;
    setTrips((n) => n + 1);
    setLastTrip({
      when: "Just now",
      miles: TRIP_MILES,
      route: "Newcastle City Centre to Quayside",
      as: choice ?? "business",
      real: true,
    });
    if (choice !== "business" || held) return;
    const from = claimFrom.current;
    const to = Math.round((from + TRIP_CLAIM) * 100) / 100;
    claimFrom.current = to;
    const started = performance.now();
    let frame = 0;
    const run = (now: number) => {
      const t = Math.min(1, (now - started) / 1100);
      setClaim(from + (to - from) * easeOut(t));
      if (t < 1) frame = requestAnimationFrame(run);
    };
    // Let the "+£1.47" float up first, then count.
    const wait = setTimeout(() => (frame = requestAnimationFrame(run)), 450);
    return () => {
      clearTimeout(wait);
      cancelAnimationFrame(frame);
    };
    // choice is fixed once sorted; step is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Reduced motion: the finished frame, still.
  useEffect(() => {
    if (!held) return;
    setStep("sorted");
    setChoice("business");
    setProgress(1);
    setClaim(CLAIM_START + TRIP_CLAIM);
  }, [held]);

  function classify(as: "business" | "personal") {
    if (step !== "arrived") return;
    clearTimeout(timer.current);
    setChoice(as);
    go("sorted");
  }

  /** Start Trip and Start Shift both start recording, like the real buttons. */
  function start() {
    if (step !== "idle" && step !== "rest") return;
    clearTimeout(timer.current);
    setProgress(0);
    setChoice(null);
    go("detected");
  }

  // A gentle tilt towards the pointer, on devices with a real pointer.
  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (held || e.pointerType !== "mouse" || !tilt.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    tilt.current.style.setProperty("--ry", `${(x * 9).toFixed(2)}deg`);
    tilt.current.style.setProperty("--rx", `${(-y * 7).toFixed(2)}deg`);
  }
  function onLeave() {
    tilt.current?.style.setProperty("--ry", "-4deg");
    tilt.current?.style.setProperty("--rx", "2deg");
  }

  const status =
    step === "detected"
      ? { tone: "amber", text: "Driving detected" }
      : recording
        ? { tone: "amber", text: `Recording · ${miles.toFixed(1)} mi · ${Math.max(1, Math.round(seconds / 60))} min` }
        : step === "arrived"
          ? { tone: "green", text: "Trip saved on its own" }
          : { tone: "green", text: "Recording automatically" };

  const heroLine =
    step === "sorted" && choice === "business"
      ? `+${money(TRIP_CLAIM)} from this trip`
      : step === "sorted" && choice === "personal"
        ? "Personal trips claim nothing"
        : `Since 6 April · ${trips} trips this week`;

  const caption =
    step === "arrived"
      ? "Your turn: tap Business or Personal."
      : step === "sorted" || step === "rest"
        ? "That's the only tap a trip needs."
        : "Nothing tapped. MileClear is doing this on its own.";

  return (
    <div
      ref={root}
      className={`md md--${step}${held ? " md--held" : ""}`}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <div className="md__glow" aria-hidden="true" />
      <div ref={tilt} className="md__tilt">
        <div
          className="md__phone"
          role="group"
          aria-label={`The MileClear Home screen records a ${TRIP_MILES} mile drive across Newcastle on its own, then adds ${money(TRIP_CLAIM)} to the year's mileage claim once it is marked as business.`}
        >
          <div className="md__bar" aria-hidden="true">
            <span>09:41</span>
            <span className="md__island" />
            <span className="md__bar-right">
              <i className="md__signal" />
              <i className="md__battery" />
            </span>
          </div>

          <div className="md__head" aria-hidden="true">
            <span className="md__wordmark">
              Mile<span>Clear</span>
            </span>
            <span className="md__modes">
              <span className="md__mode md__mode--on">Work</span>
              <span className="md__mode">Personal</span>
            </span>
            <span className="md__avatar" />
          </div>

          <div className={`md__status md__status--${status.tone}`} aria-hidden="true">
            <i />
            <span key={status.text.split(" ·")[0]} className="md__status-text">
              {status.text}
            </span>
          </div>

          <div className="md__hero" aria-hidden="true">
            <span className="md__hero-label">Mileage claim · 2026-27</span>
            <strong className="md__hero-figure">{money(claim)}</strong>
            <span key={heroLine.slice(0, 6)} className="md__hero-line">
              {heroLine}
            </span>
          </div>

          <div className="md__buttons">
            <button type="button" className="md__btn md__btn--primary" onClick={start}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 11l18-8-8 18-2-8-8-2z" />
              </svg>
              {recording || step === "detected" ? "Recording" : "Start Trip"}
            </button>
            <button type="button" className="md__btn" onClick={start}>
              Start Shift
            </button>
          </div>

          {/* The trip card. One slot, fixed height: the last trip, then the
              live map, then the saved trip asking for its one tap. */}
          <div className="md__card">
            <div className="md__layer md__layer--last" aria-hidden="true">
              <div className="md__card-top">
                <span className="md__card-when">
                  {lastTrip.when} · {lastTrip.miles.toFixed(1)} mi
                </span>
                <span className={`md__chip md__chip--${lastTrip.as}`}>
                  {lastTrip.as === "business" ? "Business" : "Personal"}
                </span>
              </div>
              <p className="md__card-route">{lastTrip.route}</p>
              {lastTrip.real ? (
                <div className="md__thumb" aria-hidden="true">
                  <div className="md__tiles">
                    {HERO_ROUTE.tiles.map((t) => (
                      <img
                        key={`${t.x}-${t.y}`}
                        src={`https://tile.openstreetmap.org/${HERO_ROUTE.zoom}/${t.x}/${t.y}.png`}
                        alt=""
                        width={256}
                        height={256}
                        loading="lazy"
                        style={{ left: `${t.left}%`, top: `${t.top}%`, width: `${t.w}%`, height: `${t.h}%` }}
                      />
                    ))}
                  </div>
                  <svg className="md__overlay" viewBox={`0 0 ${HERO_ROUTE.w} ${HERO_ROUTE.h}`} preserveAspectRatio="xMidYMid slice">
                    <path className="md__thumb-route" d={HERO_ROUTE.path} />
                    <circle className="md__pin" cx={HERO_ROUTE.start.x} cy={HERO_ROUTE.start.y} r="5" />
                    <circle className="md__pin md__pin--end md__pin--on" cx={HERO_ROUTE.end.x} cy={HERO_ROUTE.end.y} r="5" />
                  </svg>
                </div>
              ) : (
                <svg className="md__mini" viewBox="0 0 120 40" aria-hidden="true">
                  <path d="M6 32 C 26 30, 30 12, 52 14 S 84 30, 114 8" />
                  <circle cx="6" cy="32" r="3" className="md__mini-start" />
                  <circle cx="114" cy="8" r="3" className="md__mini-end" />
                </svg>
              )}
              <span className="md__card-foot">See all trips ›</span>
            </div>

            <div className="md__layer md__layer--trip">
              <div className="md__map" aria-hidden="true">
                <div className="md__tiles">
                  {HERO_ROUTE.tiles.map((t) => (
                    <img
                      key={`${t.x}-${t.y}`}
                      src={`https://tile.openstreetmap.org/${HERO_ROUTE.zoom}/${t.x}/${t.y}.png`}
                      alt=""
                      width={256}
                      height={256}
                      loading="lazy"
                      style={{ left: `${t.left}%`, top: `${t.top}%`, width: `${t.w}%`, height: `${t.h}%` }}
                    />
                  ))}
                </div>
                <svg
                  className="md__overlay"
                  viewBox={`0 0 ${HERO_ROUTE.w} ${HERO_ROUTE.h}`}
                  preserveAspectRatio="xMidYMid slice"
                >
                  <path className="md__route-shadow" d={HERO_ROUTE.path} pathLength={1} />
                  <path
                    ref={routeRef}
                    className="md__route"
                    d={HERO_ROUTE.path}
                    pathLength={1}
                    style={{ strokeDashoffset: 1 - progress }}
                  />
                  <circle className="md__pin" cx={HERO_ROUTE.start.x} cy={HERO_ROUTE.start.y} r="5" />
                  <circle
                    className={`md__pin md__pin--end${saved ? " md__pin--on" : ""}`}
                    cx={HERO_ROUTE.end.x}
                    cy={HERO_ROUTE.end.y}
                    r="5"
                  />
                  <g ref={carRef} className={`md__car${saved ? " md__car--parked" : ""}`}>
                    <circle className="md__car-ring" r="12" />
                    <circle className="md__car-dot" r="6" />
                  </g>
                </svg>
                <span className={`md__live${saved ? " md__live--saved" : ""}`}>
                  <i />
                  {saved ? "Trip saved" : "Recording"}
                </span>
                <span className="md__osm">
                  &copy;{" "}
                  <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                    OpenStreetMap
                  </a>
                </span>
              </div>

              <div className="md__trip-row" aria-hidden="true">
                <span className="md__trip-miles">
                  <strong>{(saved ? TRIP_MILES : miles).toFixed(1)}</strong> mi
                </span>
                <span className="md__trip-time">{clock(saved ? TRIP_SECONDS : seconds)}</span>
                <span className="md__trip-place">{saved ? "Newcastle City Centre to Quayside" : "Driving now"}</span>
              </div>

              <div className={`md__sort${saved ? " md__sort--on" : ""}`}>
                <button
                  type="button"
                  className={`md__pick md__pick--business${choice === "business" ? " md__pick--chosen" : ""}`}
                  onClick={() => classify("business")}
                  disabled={step !== "arrived"}
                >
                  Business
                </button>
                <button
                  type="button"
                  className={`md__pick${choice === "personal" ? " md__pick--chosen" : ""}`}
                  onClick={() => classify("personal")}
                  disabled={step !== "arrived"}
                >
                  Personal
                </button>
                <span className="md__ask" aria-hidden="true">
                  Tap one
                </span>
              </div>
            </div>

            {step === "sorted" && choice === "business" && !held && (
              <span className="md__float" aria-hidden="true">
                +{money(TRIP_CLAIM)}
              </span>
            )}
            <span className="md__learned" aria-hidden="true">
              Learned: this route files itself as {choice === "personal" ? "personal" : "business"} from now on
            </span>
          </div>

          <div className="md__doors" aria-hidden="true">
            <div className="md__door">
              <span className="md__door-name">Tax</span>
              <span className="md__door-text">£107.96 set aside this week</span>
              <span className="md__door-arrow">›</span>
            </div>
            <div className="md__door">
              <span className="md__door-name">Insights</span>
              <span className="md__door-text">Busiest day: Saturday</span>
              <span className="md__door-arrow">›</span>
            </div>
          </div>

          <nav className="md__tabs" aria-hidden="true">
            {[
              { name: "Home", d: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
              { name: "Trips", d: "M5 17h14M7 13l2-5h6l2 5M6 17v2M18 17v2M5 13h14v4H5z" },
              { name: "Tax", d: "M6 3h9l3 3v15H6zM9 10h6M9 14h6M9 18h4" },
              { name: "Insights", d: "M5 20V11M10 20V5M15 20v-7M20 20V8" },
              { name: "More", d: "M6 12h.01M12 12h.01M18 12h.01" },
            ].map((t) => (
              <span key={t.name} className={`md__tab${t.name === "Home" ? " md__tab--on" : ""}`}>
                <svg viewBox="0 0 24 24">
                  <path d={t.d} />
                </svg>
                {t.name}
              </span>
            ))}
          </nav>
        </div>
      </div>

      <p key={caption} className="md__caption">
        {caption}
      </p>
    </div>
  );
}
