"use client";

// The hero plays one drive, start to finish: the app notices you set off,
// records the route, saves the trip at the kerb, and adds the miles to your
// claim when it is classified. The only thing a driver actually does is that
// last tap, so that is the only part a visitor can do too: the Business and
// Personal buttons are live, and the figures follow whichever is chosen.
//
// Reduced motion and no JavaScript get the same panel rather than a
// substitute: without JS it sits in the first frame, and for reduced motion it
// sits in the last one, trip saved and claimed, with nothing moving. Same
// markup and same height either way, so the hero never jumps.

import { useCallback, useEffect, useRef, useState } from "react";

type Step = "waiting" | "detected" | "recording" | "arrived" | "classified";

/** 3.1 miles at the 2026-27 AMAP rate of 55p, driven in 12 minutes 4 seconds. */
const TRIP_MILES = 3.1;
const TRIP_SECONDS = 724;
const CLAIM_BEFORE = 39.72;
const CLAIM_AFTER = 41.43;

const BEATS: Record<Step, number> = {
  waiting: 2200,
  detected: 2000,
  recording: 5200,
  arrived: 3600,
  classified: 3800,
};

const ORDER: Step[] = ["waiting", "detected", "recording", "arrived", "classified"];

function formatMiles(n: number) {
  return n.toFixed(1);
}

function formatClock(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function HeroDemo() {
  const [step, setStep] = useState<Step>("waiting");
  const [miles, setMiles] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [claim, setClaim] = useState(CLAIM_BEFORE);
  const [choice, setChoice] = useState<"business" | "personal" | null>(null);
  const [playing, setPlaying] = useState(false);
  const [staticFallback, setStaticFallback] = useState(false);
  const frame = useRef<number | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);

  // Motion is opt-in twice over: the viewer has not asked for reduced motion,
  // and the phone is actually on screen.
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setStaticFallback(motion.matches);
    apply();
    motion.addEventListener("change", apply);
    return () => motion.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (staticFallback || !root.current) return;
    const el = root.current;
    const io = new IntersectionObserver(
      ([entry]) => setPlaying(entry.isIntersecting && document.visibilityState === "visible"),
      { threshold: 0.35 }
    );
    io.observe(el);
    const onVisibility = () => setPlaying(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [staticFallback]);

  const advance = useCallback((next: Step) => {
    setStep(next);
    if (next === "waiting") {
      setMiles(0);
      setSeconds(0);
      setClaim(CLAIM_BEFORE);
      setChoice(null);
    }
  }, []);

  // The beat clock. Each step hands over to the next until a viewer takes the
  // classification themselves, which just skips the rest of that beat.
  useEffect(() => {
    if (!playing || staticFallback) return;
    const idx = ORDER.indexOf(step);
    const next = ORDER[(idx + 1) % ORDER.length];
    timer.current = setTimeout(() => advance(next), BEATS[step]);
    return () => clearTimeout(timer.current);
  }, [step, playing, staticFallback, advance]);

  // Miles count up over the recording beat, then hold.
  useEffect(() => {
    if (step !== "recording" || staticFallback) return;
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
  }, [step, staticFallback]);

  // The claim total only moves for business miles, which is the whole point of
  // classifying: a personal trip is recorded and claims nothing.
  useEffect(() => {
    if (step !== "classified" || choice !== "business" || staticFallback) {
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
  }, [step, choice, staticFallback]);

  useEffect(() => {
    if (step === "classified" && choice === null) setChoice("business");
  }, [step, choice]);

  useEffect(() => {
    if (!staticFallback) return;
    setStep("classified");
    setChoice("business");
    setMiles(TRIP_MILES);
    setSeconds(TRIP_SECONDS);
    setClaim(CLAIM_AFTER);
  }, [staticFallback]);

  function classify(as: "business" | "personal") {
    clearTimeout(timer.current);
    setChoice(as);
    setMiles(TRIP_MILES);
    setSeconds(TRIP_SECONDS);
    setStep("classified");
  }

  const recording = step === "recording";
  const done = step === "arrived" || step === "classified";

  return (
    <div
      ref={root}
      className={`demo demo--${step}`}
      role="img"
      aria-label="MileClear records a 3.1 mile drive from Newcastle city centre to the Quayside on its own, then adds it to the year's mileage claim once it is marked as business."
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
          <span className={`demo__state${recording ? " demo__state--live" : ""}`}>
            <i />
            {recording ? "Recording" : done ? "Saved" : "Watching for drives"}
          </span>
        </div>

        <div className="demo__map" aria-hidden="true">
          <svg viewBox="0 0 320 210" role="presentation">
            <defs>
              <linearGradient id="demoRoute" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#fcd34d" />
                <stop offset="100%" stopColor="#eab308" />
              </linearGradient>
            </defs>
            <rect width="320" height="210" fill="#0a1120" />
            <path d="M0 148 H320" stroke="rgba(148,163,184,0.10)" strokeWidth="26" />
            <path d="M74 0 V210 M214 0 V210" stroke="rgba(148,163,184,0.07)" strokeWidth="12" />
            <path d="M0 62 H320" stroke="rgba(148,163,184,0.07)" strokeWidth="10" />
            <rect x="18" y="14" width="42" height="34" rx="6" fill="rgba(148,163,184,0.05)" />
            <rect x="232" y="76" width="64" height="52" rx="8" fill="rgba(16,185,129,0.06)" />
            <rect x="96" y="160" width="96" height="36" rx="6" fill="rgba(148,163,184,0.05)" />
            <path
              className="demo__route"
              d="M52 176 C 96 176, 96 140, 124 128 S 176 104, 214 84 C 240 70, 258 58, 276 44"
              fill="none"
              stroke="url(#demoRoute)"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <circle className="demo__pin demo__pin--start" cx="52" cy="176" r="6" />
            <circle className="demo__pin demo__pin--end" cx="276" cy="44" r="6" />
          </svg>
          <span className="demo__toast">Driving detected. Recording this trip.</span>
        </div>

        <div className="demo__readout" aria-hidden="true">
          <div className="demo__figure">
            <strong>{formatMiles(recording || done ? (done ? TRIP_MILES : miles) : 0)}</strong>
            <span>miles</span>
          </div>
          <div className="demo__figure">
            <strong>{formatClock(done ? TRIP_SECONDS : seconds)}</strong>
            <span>duration</span>
          </div>
        </div>

        <div className="demo__card" aria-hidden={step === "waiting" || step === "detected"}>
          <p className="demo__route-line">
            Newcastle City Centre <span>to</span> Quayside
          </p>
          <div className="demo__choice">
            <button
              type="button"
              className={`demo__btn${choice === "business" ? " demo__btn--on" : ""}`}
              onClick={() => classify("business")}
              disabled={!done}
            >
              Business
            </button>
            <button
              type="button"
              className={`demo__btn demo__btn--alt${choice === "personal" ? " demo__btn--on" : ""}`}
              onClick={() => classify("personal")}
              disabled={!done}
            >
              Personal
            </button>
          </div>
        </div>

        <div className="demo__claim" aria-hidden="true">
          <span className="demo__claim-label">Mileage claim, 2026-27</span>
          <strong className="demo__claim-value">
            £{claim.toFixed(2)}
            <em>
              {step === "classified"
                ? choice === "business"
                  ? "+£1.71 from this trip"
                  : "personal, nothing claimed"
                : "3.1 mi at 55p a mile"}
            </em>
          </strong>
        </div>
      </div>

      <p className="demo__hint">
        {done
          ? "Your turn: pick Business or Personal."
          : "Nothing tapped. That is the app doing the work."}
      </p>
    </div>
  );
}
