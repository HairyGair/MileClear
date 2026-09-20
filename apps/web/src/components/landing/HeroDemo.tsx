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

type Step = "waiting" | "detected" | "recording" | "arrived" | "classified";

/** 3.1 miles at the 2026-27 AMAP rate of 55p, driven in 12 minutes 4 seconds. */
const TRIP_MILES = 3.1;
const TRIP_SECONDS = 724;
const CLAIM_BEFORE = 39.72;
const CLAIM_AFTER = 41.43;
const MILES_TODAY = 11.9;
const TRIPS_TODAY = 19;

const BEATS: Record<Step, number> = {
  waiting: 2600,
  detected: 2200,
  recording: 5400,
  arrived: 4000,
  classified: 4200,
};

const ORDER: Step[] = ["waiting", "detected", "recording", "arrived", "classified"];

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
  const [playing, setPlaying] = useState(false);
  const [held, setHeld] = useState(false);
  const frame = useRef<number | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);

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
      setClaim(CLAIM_BEFORE);
      setChoice(null);
    }
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
    if (step !== "classified" || choice !== "business" || held) {
      if (step !== "classified") setClaim(CLAIM_BEFORE);
      return;
    }
    const started = performance.now();
    const run = (now: number) => {
      const progress = Math.min(1, (now - started) / 900);
      const eased = 1 - Math.pow(1 - progress, 3);
      setClaim(CLAIM_BEFORE + (CLAIM_AFTER - CLAIM_BEFORE) * eased);
      if (progress < 1) frame.current = requestAnimationFrame(run);
    };
    frame.current = requestAnimationFrame(run);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [step, choice, held]);

  useEffect(() => {
    if (step === "classified" && choice === null) setChoice("business");
  }, [step, choice]);

  // Reduced motion: hold the finished frame rather than animate towards it.
  useEffect(() => {
    if (!held) return;
    setStep("classified");
    setChoice("business");
    setMiles(TRIP_MILES);
    setSeconds(TRIP_SECONDS);
    setClaim(CLAIM_AFTER);
  }, [held]);

  function classify(as: "business" | "personal") {
    clearTimeout(timer.current);
    setChoice(as);
    setMiles(TRIP_MILES);
    setSeconds(TRIP_SECONDS);
    setStep("classified");
  }

  const recording = step === "recording";
  const saved = step === "arrived" || step === "classified";
  const counted = step === "classified" && choice === "business";
  const milesToday = counted ? MILES_TODAY + TRIP_MILES : MILES_TODAY;
  const tripCount = saved ? TRIPS_TODAY + 1 : TRIPS_TODAY;

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
              <span className="demo__claim-label">Mileage claim · 2026-27</span>
              <strong className="demo__claim-value">£{claim.toFixed(2)}</strong>
              <span className="demo__claim-sub">
                {counted ? "+£1.71 from this trip" : "at 55p a mile, first 10,000"}
              </span>
              <span className="demo__claim-stats">
                {milesToday.toFixed(1)} mi today · 57.8 mi this week · {tripCount} trips
              </span>
            </div>
          </div>

          <div className="demo__layer demo__layer--trip">
            <div className="demo__map">
              <svg viewBox="0 0 320 150" role="presentation">
                <defs>
                  <linearGradient id="demoRoute" x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0%" stopColor="#fcd34d" />
                    <stop offset="100%" stopColor="#eab308" />
                  </linearGradient>
                </defs>
                <rect width="320" height="150" fill="#0a1120" />
                <path d="M0 106 H320" stroke="rgba(148,163,184,0.10)" strokeWidth="20" />
                <path d="M78 0 V150 M226 0 V150" stroke="rgba(148,163,184,0.07)" strokeWidth="11" />
                <path d="M0 42 H320" stroke="rgba(148,163,184,0.07)" strokeWidth="9" />
                <rect x="20" y="8" width="40" height="24" rx="6" fill="rgba(148,163,184,0.05)" />
                <rect x="240" y="52" width="58" height="40" rx="8" fill="rgba(16,185,129,0.06)" />
                <rect x="100" y="114" width="88" height="28" rx="6" fill="rgba(148,163,184,0.05)" />
                <path
                  className="demo__route"
                  d="M48 126 C 92 126, 92 96, 120 88 S 170 70, 208 56 C 232 46, 252 38, 272 28"
                  fill="none"
                  stroke="url(#demoRoute)"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <circle className="demo__pin demo__pin--start" cx="48" cy="126" r="6" />
                <circle className="demo__pin demo__pin--end" cx="272" cy="28" r="6" />
              </svg>
              <span className="demo__live">
                <i />
                {recording ? "Recording" : "Trip saved"}
              </span>
            </div>
            <div className="demo__readout">
              <div className="demo__figure">
                <strong>{(saved ? TRIP_MILES : miles).toFixed(1)}</strong>
                <span>miles</span>
              </div>
              <div className="demo__figure">
                <strong>{clock(saved ? TRIP_SECONDS : seconds)}</strong>
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
            {saved ? (
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

        <div className="demo__actions" aria-hidden="true">
          <span className="demo__action demo__action--primary">
            {recording ? "Stop Trip" : "Start Trip"}
          </span>
          <span className="demo__action">{recording ? "Pause" : "Start Shift"}</span>
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
