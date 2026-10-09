"use client";

import { useEffect, useState, type ReactNode } from "react";
import { safeGet, safeSet } from "../../../lib/dashboard/mode";
import { Icon } from "../kit/Icon";

/** Two columns from 1024px, one below. The hero spans the full width. Cards that render nothing leave no gap. */
export function HomeGrid({ hero, children }: { hero?: ReactNode; children: ReactNode }) {
  return (
    <div className="mc-home__grid">
      {hero !== undefined && <div className="mc-home__hero" data-tour="home-hero">{hero}</div>}
      {children}
    </div>
  );
}

const MORE_KEY = "mc_home_more_open";

/** The collapsed "More for you" disclosure. Open state is remembered. */
export function MoreForYou({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(safeGet(MORE_KEY) === "1");
  }, []);
  return (
    <section aria-label="More for you">
      <button
        type="button"
        className="mc-more-for-you__toggle"
        aria-expanded={open}
        aria-controls="mc-more-for-you"
        onClick={() => {
          setOpen((o) => {
            safeSet(MORE_KEY, o ? "0" : "1");
            return !o;
          });
        }}
      >
        <Icon name={open ? "chevron-down" : "chevron-forward"} size={16} />
        More for you
      </button>
      {open && (
        <div id="mc-more-for-you" className="mc-home__grid mc-home__grid--spaced">
          {children}
        </div>
      )}
    </section>
  );
}
