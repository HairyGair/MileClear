"use client";

// The hero's opening line as a car odometer: the real all-time miles MileClear
// drivers have recorded (GET /community/totals, rounded down, refreshed
// hourly), on mechanical drums that roll up to the figure once when the page
// opens, the right-hand drums spinning fastest like a real one. It never
// counts past the figure: the "+" says it is a floor.
//
// The server renders the finished reading, so it is right without JavaScript
// and for search engines; reduced motion keeps it still.

import { useEffect, useState } from "react";
import "./hero-odometer.css";

const DIGITS = "0123456789";

export default function HeroOdometer({ miles }: { miles: number }) {
  const reading = String(Math.max(0, Math.floor(miles)));
  const [phase, setPhase] = useState<"final" | "zero" | "roll">("final");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setPhase("zero");
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setPhase("roll"));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);

  const count = reading.length;
  const label = `${Number(reading).toLocaleString("en-GB")}+ miles tracked by MileClear drivers. Unlimited tracking, free forever.`;

  return (
    <div className={`odo odo--${phase}`} role="img" aria-label={label}>
      <span className="odo__label" aria-hidden="true">
        Miles
        <br />
        tracked
      </span>
      <span className="odo__window" aria-hidden="true">
        {reading.split("").map((d, i) => {
          const fromRight = count - 1 - i;
          // Drums further right spin through more turns before they settle.
          const turns = Math.min(3, fromRight);
          const target = turns * 10 + Number(d);
          const gap = fromRight > 0 && fromRight % 3 === 0;
          return (
            <span key={i} className={`odo__drum${fromRight === 0 ? " odo__drum--last" : ""}${gap ? " odo__drum--gap" : ""}`}>
              <span
                className="odo__strip"
                style={{
                  ["--to" as string]: phase === "zero" ? 0 : target,
                  ["--delay" as string]: `${0.15 + (count - fromRight) * 0.07}s`,
                  ["--dur" as string]: `${1.2 + turns * 0.35}s`,
                }}
              >
                {Array.from({ length: turns * 10 + 10 }, (_, k) => (
                  <span key={k} className="odo__digit">
                    {DIGITS[k % 10]}
                  </span>
                ))}
              </span>
            </span>
          );
        })}
      </span>
      <span className="odo__plus" aria-hidden="true">+</span>
      <span className="odo__free" aria-hidden="true">
        Unlimited tracking.
        <br />
        <strong>Free, forever.</strong>
      </span>
    </div>
  );
}
