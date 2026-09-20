"use client";

// The hero is the app's own Work dashboard, playing one drive end to end: it
// notices you set off, records the route while the miles climb, saves the trip
// at the kerb, and puts the miles on the year's claim once it is classified.
// The layout follows the real dashboard (mode toggle, the week's nudge, the
// claim card, Start Trip and Start Shift, the weekly set-aside, today's row),
// so what a visitor sees here is what they get after installing.
//
// The one tap the app asks of a driver is the one thing a visitor can do: the
// Business and Personal buttons are live, and Personal claims nothing.
//
// Reduced motion holds the last frame with nothing moving, and without
// JavaScript the first frame renders on the server. Same markup and the same
// height in every case, so the hero never jumps.

import { useCallback, useEffect, useRef, useState } from "react";
import { HERO_ROUTE } from "@/data/heroRoute";

type Step =
  | "waiting"
  | "detected"
  | "recording"
  | "arrived"
  | "classified"
  | "learned"
  | "filed";

/** The real drive in data/heroRoute.ts, priced at the 2026-27 AMAP rate. */
const TRIP_MILES = HERO_ROUTE.miles;
const TRIP_SECONDS = HERO_ROUTE.seconds;
const AMAP_RATE = 0.55;
const CLAIM_BEFORE = 39.72;
const MILES_TODAY = 11.9;
const TRIPS_TODAY = 19;

/** What a given number of business miles adds to the claim, in pounds. */
const claimFor = (miles: number) => Math.round(miles * AMAP_RATE * 100) / 100;

const BEATS: Record<Step, number> = {
  waiting: 2400,
  detected: 2200,
  recording: 6000,
  arrived: 3600,
  classified: 3400,
  learned: 3000,
  filed: 3800,
};

const ORDER: Step[] = [
  "waiting",
  "detected",
  "recording",
  "arrived",
  "classified",
  "learned",
  "filed",
];

const clock = (totalSeconds: number) => {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

export default function HeroDemo() {
  const [step, setStep] = useState<Step>("waiting");
  const [miles, setMiles] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [claim, setClaim] = useState(CLAIM_BEFORE);
  const [choice, setChoice] = useState<"business" | "personal" | null>(null);
  /** Miles on the clock when the trip stopped. Whole route unless a visitor stops it early. */
  const [banked, setBanked] = useState<number>(TRIP_MILES);
  const [shiftFrom, setShiftFrom] = useState<number | null>(null);
  const [shiftSeconds, setShiftSeconds] = useState(0);
  const [shiftTrips, setShiftTrips] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [held, setHeld] = useState(false);
  const frame = useRef<number | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);

  const recording = step === "recording";
  const settled = step === "classified" || step === "learned" || step === "filed";
  const saved = step === "arrived" || settled;
  const counted = settled && choice === "business";
  const added = claimFor(banked);
  const filed = step === "filed";
  const milesToday = counted ? MILES_TODAY + banked : MILES_TODAY;
  const tripCount = saved ? TRIPS_TODAY + 1 : TRIPS_TODAY;

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setHeld(motion.matches);
    apply();
    motion.addEventListener("change", apply);
    return () => motion.removeEventListener("change", apply);
  }, []);

  // Motion is opt in twice over: the viewer has not asked for reduced motion,
  // and the panel is on screen in a visible tab.
  useEffect(() => {
    if (held || !root.current) return;
    const el = root.current;
    const io = new IntersectionObserver(
      ([entry]) => setPlaying(entry.isIntersecting && document.visibilityState === "visible"),
      { threshold: 0.3 }
    );
    io.observe(el);
    const onVisibility = () => setPlaying(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [held]);

  const advance = useCallback((next: Step) => {
    setStep(next);
    if (next === "waiting") {
      setMiles(0);
      setSeconds(0);
      setBanked(TRIP_MILES);
      setClaim(CLAIM_BEFORE);
      setChoice(null);
    }
    if (next === "arrived") setBanked(TRIP_MILES);
  }, []);

  useEffect(() => {
    if (!playing || held) return;
    const idx = ORDER.indexOf(step);
    timer.current = setTimeout(() => advance(ORDER[(idx + 1) % ORDER.length]), BEATS[step]);
    return () => clearTimeout(timer.current);
  }, [step, playing, held, advance]);

  useEffect(() => {
    if (step !== "recording" || held) return;
    const started = performance.now();
    const run = (now: number) => {
      const progress = Math.min(1, (now - started) / BEATS.recording);
      setMiles(TRIP_MILES * progress);
      setSeconds(TRIP_SECONDS * progress);
      if (progress < 1) frame.current = requestAnimationFrame(run);
    };
    frame.current = requestAnimationFrame(run);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [step, held]);

  // The claim only moves for business miles. That is what classifying decides.
  useEffect(() => {
    if (!settled || choice !== "business" || held) {
      // Not settled yet, or the viewer said personal: either way the claim
      // sits where it was. Personal miles are recorded and claim nothing,
      // which is the whole point of being asked.
      setClaim(CLAIM_BEFORE);
      return;
    }
    const started = performance.now();
    const run = (now: number) => {
      const progress = Math.min(1, (now - started) / 900);
      const eased = 1 - Math.pow(1 - progress, 3);
      setClaim(CLAIM_BEFORE + added * eased);
      if (progress < 1) frame.current = requestAnimationFrame(run);
    };
    frame.current = requestAnimationFrame(run);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [settled, choice, held, added]);

  useEffect(() => {
    if (settled && choice === null) setChoice("business");
  }, [settled, choice]);

  useEffect(() => {
    if (step !== "arrived" || shiftFrom === null) return;
    setShiftTrips((n) => (n === 0 ? 1 : n));
  }, [step, shiftFrom]);

  // The shift clock, which is the only thing here that runs on real time.
  useEffect(() => {
    if (shiftFrom === null) return;
    const tick = () => setShiftSeconds(Math.floor((Date.now() - shiftFrom) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [shiftFrom]);

  // Reduced motion: hold the finished frame rather than animate towards it.
  useEffect(() => {
    if (!held) return;
    setStep("filed");
    setChoice("business");
    setMiles(TRIP_MILES);
    setSeconds(TRIP_SECONDS);
    setClaim(CLAIM_BEFORE + claimFor(TRIP_MILES));
  }, [held]);

  function classify(as: "business" | "personal") {
    clearTimeout(timer.current);
    setChoice(as);
    setStep("classified");
  }

  /** Start Trip, and Stop Trip once it is running. Both are the real buttons. */
  function toggleTrip() {
    clearTimeout(timer.current);
    if (recording) {
      setBanked(Math.round(miles * 100) / 100);
      setStep("arrived");
      if (shiftFrom !== null) setShiftTrips((n) => n + 1);
      return;
    }
    setMiles(0);
    setSeconds(0);
    setChoice(null);
    setClaim(CLAIM_BEFORE);
    setStep("recording");
  }

  /** Start Shift, and End Shift once one is running. */
  function toggleShift() {
    if (shiftFrom === null) {
      setShiftFrom(Date.now());
      setShiftSeconds(0);
      setShiftTrips(0);
      return;
    }
    setShiftFrom(null);
  }


  return (
    <div
      ref={root}
      className={`demo demo--${step}`}
      role="img"
      aria-label="The MileClear dashboard records a 3.1 mile drive from Newcastle city centre to the Quayside on its own, then adds it to the year's mileage claim once it is marked as business."
    >
      <div className="demo__phone">
        <div className="demo__bar" aria-hidden="true">
          <span>09:41</span>
          <span className="demo__notch" />
          <span className="demo__bar-right">
            <i className="demo__signal" />
            <i className="demo__battery" />
          </span>
        </div>

        <div className="demo__head" aria-hidden="true">
          <span className="demo__wordmark">
            Mile<span>Clear</span>
          </span>
          <span className="demo__avatar" />
        </div>

        <div className="demo__modes" aria-hidden="true">
          <span className="demo__mode demo__mode--on">Work</span>
          <span className="demo__mode">Personal</span>
          {shiftFrom !== null && (
            <span className="demo__shift">
              On shift {clock(shiftSeconds)} · {shiftTrips} {shiftTrips === 1 ? "trip" : "trips"}
            </span>
          )}
        </div>

        {/* The middle swaps between the dashboard and the live trip. Fixed
            height, so nothing below it moves while the drive plays. */}
        <div className="demo__stage" aria-hidden="true">
          <div className="demo__layer demo__layer--home">
            <div className="demo__nudge">
              <strong>Great week so far</strong>
              <span>You have driven 57.8 miles this week. Above your usual pace.</span>
            </div>
            <div className="demo__claim">
              <span className="demo__claim-label">
                {filed ? "Self Assessment · SA103 box 20" : "Mileage claim · 2026-27"}
              </span>
              <strong className="demo__claim-value">£{claim.toFixed(2)}</strong>
              <span className="demo__claim-sub">
                {choice === "personal" && settled
                  ? "Personal trip, nothing claimed"
                  : filed
                    ? "Your mileage, in the box it belongs in"
                    : counted
                      ? `+£${added.toFixed(2)} from this trip`
                      : "at 55p a mile, first 10,000"}
              </span>
              <span className="demo__claim-stats">
                {milesToday.toFixed(1)} mi today · 57.8 mi this week · {tripCount} trips
              </span>
            </div>
          </div>

          <div className="demo__layer demo__layer--trip">
            <div className="demo__map">
              {/* Real OpenStreetMap tiles, positioned by percentage inside the
                  same frame the route is drawn in, so they scale together. */}
              <div className="demo__tiles">
                {HERO_ROUTE.tiles.map((t) => (
                  <img
                    key={`${t.x}-${t.y}`}
                    src={`https://tile.openstreetmap.org/${HERO_ROUTE.zoom}/${t.x}/${t.y}.png`}
                    alt=""
                    width={256}
                    height={256}
                    loading="lazy"
                    style={{
                      left: `${t.left}%`,
                      top: `${t.top}%`,
                      width: `${t.w}%`,
                      height: `${t.h}%`,
                    }}
                  />
                ))}
              </div>
              <svg
                className="demo__overlay"
                viewBox={`0 0 ${HERO_ROUTE.w} ${HERO_ROUTE.h}`}
                preserveAspectRatio="xMidYMid slice"
                role="presentation"
              >
                <defs>
                  <linearGradient id="demoRoute" x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0%" stopColor="#fcd34d" />
                    <stop offset="100%" stopColor="#eab308" />
                  </linearGradient>
                </defs>
                <path
                  className="demo__route"
                  d={HERO_ROUTE.path}
                  fill="none"
                  stroke="url(#demoRoute)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle className="demo__car" r="4.5">
                  <animateMotion dur="6s" repeatCount="1" path={HERO_ROUTE.path} />
                </circle>
                <circle
                  className="demo__pin demo__pin--start"
                  cx={HERO_ROUTE.start.x}
                  cy={HERO_ROUTE.start.y}
                  r="5.5"
                />
                <circle
                  className="demo__pin demo__pin--end"
                  cx={HERO_ROUTE.end.x}
                  cy={HERO_ROUTE.end.y}
                  r="5.5"
                />
              </svg>
              <span className="demo__live">
                <i />
                {recording ? "Recording" : "Trip saved"}
              </span>
              <span className="demo__osm">
                &copy;{" "}
                <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                  OpenStreetMap
                </a>
              </span>
            </div>
            <div className="demo__readout">
              <div className="demo__figure">
                <strong>{(saved ? banked : miles).toFixed(1)}</strong>
                <span>miles</span>
              </div>
              <div className="demo__figure">
                <strong>{clock(saved ? Math.round((banked / TRIP_MILES) * TRIP_SECONDS) : seconds)}</strong>
                <span>duration</span>
              </div>
              <div className="demo__figure">
                <strong>Deliveroo</strong>
                <span>platform</span>
              </div>
            </div>
          </div>

          <span className="demo__toast">Driving detected. Recording this trip.</span>
        </div>

        <div className="demo__classify">
          <p className="demo__route-line" aria-hidden="true">
            {step === "learned" || filed ? (
              <>
                Learned: this route files itself as{" "}
                {choice === "personal" ? "personal" : "business"} from now on
              </>
            ) : saved ? (
              <>
                Newcastle City Centre <span>to</span> Quayside
              </>
            ) : (
              <>Where this one ends is not known yet</>
            )}
          </p>
          <div className="demo__choice">
            <button
              type="button"
              className={`demo__btn${choice === "business" ? " demo__btn--on" : ""}`}
              onClick={() => classify("business")}
              disabled={!saved}
            >
              Business
            </button>
            <button
              type="button"
              className={`demo__btn demo__btn--alt${choice === "personal" ? " demo__btn--on" : ""}`}
              onClick={() => classify("personal")}
              disabled={!saved}
            >
              Personal
            </button>
          </div>
        </div>

        <div className="demo__actions">
          <button type="button" className="demo__action demo__action--primary" onClick={toggleTrip}>
            {recording ? "Stop Trip" : "Start Trip"}
          </button>
          <button type="button" className="demo__action" onClick={toggleShift}>
            {shiftFrom !== null ? "End Shift" : "Start Shift"}
          </button>
        </div>

        <div className="demo__today" aria-hidden="true">
          <span className="demo__today-label">Set aside this week</span>
          <span className="demo__today-figures">
            <strong>£107.96</strong> of £391.45
          </span>
        </div>
      </div>

      <p className="demo__hint">
        {saved
          ? "Your turn: pick Business or Personal."
          : "Nothing tapped. That is the app doing the work."}
      </p>
    </div>
  );
}
