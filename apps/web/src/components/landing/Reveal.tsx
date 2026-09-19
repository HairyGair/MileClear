"use client";

import { useRef, useEffect } from "react";

export default function Reveal({
  children,
  className = "",
  delay = "",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Tells the layout script the app hydrated, so its watchdog leaves the
    // hidden starting state in place. Without this the page falls back to
    // showing everything, which is the safe outcome.
    document.documentElement.setAttribute("data-reveal-ready", "");

    // No observer means no way to know when the element scrolls into view, so
    // show the content rather than leave it at opacity 0 forever.
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("revealed");
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("revealed");
          observer.unobserve(el);
        }
      },
      { threshold: 0.12 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal ${delay} ${className}`.trim()}>
      {children}
    </div>
  );
}
