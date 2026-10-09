// DOM lookups for the tour: finding a visible target and reading what Home shows.

import type { HomeKind } from "./steps";

function visible(el: HTMLElement, minHeight = 1): boolean {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height < minHeight) return false;
  return getComputedStyle(el).visibility !== "hidden";
}

/**
 * The first visible element for any of the `data-tour` names. The rail and the
 * tab bar carry the same names; whichever the media query shows wins.
 */
export function resolveTarget(names: string[]): HTMLElement | null {
  for (const name of names) {
    const els = document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`);
    for (const el of Array.from(els)) {
      if (visible(el, name === "home-hero" ? 24 : 1)) return el;
    }
  }
  return null;
}

/** The home hero once it has real content (an empty wrapper or a loading skeleton does not count). */
function heroReady(): HTMLElement | null {
  const hero = resolveTarget(["home-hero"]);
  if (!hero || hero.querySelector(".mc-skel")) return null;
  return hero;
}

/** Home has settled when the hero or the setup card is on screen. */
export function homeSettled(): boolean {
  return heroReady() !== null || resolveTarget(["home-setup"]) !== null;
}

export function detectHomeKind(mode: "work" | "personal"): HomeKind {
  const hero = heroReady();
  if (hero) {
    if (mode === "personal") return "personal";
    return hero.querySelector(".mc-figure") ? "figure" : "empty";
  }
  if (resolveTarget(["home-setup"])) return "setup";
  return "none";
}

/** Something is open that the tour must not sit on top of (rule 5). */
export function somethingOpen(): boolean {
  return (
    document.querySelector("dialog[open]") !== null ||
    document.querySelector('.mc-topbar [aria-expanded="true"], .mc-main [aria-haspopup][aria-expanded="true"]') !== null
  );
}
