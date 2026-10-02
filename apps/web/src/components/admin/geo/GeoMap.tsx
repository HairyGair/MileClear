"use client";

// The hero map: one circle per postcode area (or district), sized by
// sign-ups and coloured by growth or by how many are still driving.
// Leaflet is loaded on the client only, on the same OpenStreetMap basemap as
// the density map (the CSP allows that tile host and no other).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { AdminGeoAreaRow, AdminGeoDistrictRow, AdminGeoMapPoint } from "@mileclear/shared";
import { addDarkBasemap } from "@/lib/basemap";
import { formatNumber } from "@/components/admin/ui";
import { escapeHtml } from "./labels";

export type MapLevel = "area" | "district";
export type MapMeasure = "window" | "alltime";
export type MapColour = "growth" | "active";

/** England, Scotland, Wales, Northern Ireland and the Channel Islands. */
const UK_BOUNDS: [[number, number], [number, number]] = [
  [49.85, -8.3],
  [60.9, 1.9],
];

// Growth: two hues and a grey (never a status colour, so "shrinking" does not
// read as broken), plus amber for the one thing worth spotting first.
export const GROWTH_COLOURS = {
  new: "#fbbf24",
  up: "#3987e5",
  flat: "#94a3b8",
  down: "#d95926",
  none: "#4b5a70",
} as const;

// Active share: one hue, darker for fewer still driving.
export const ACTIVE_STEPS = [
  { upTo: 20, colour: "#1c5cab", label: "Under 20%" },
  { upTo: 40, colour: "#2a78d6", label: "20 to 40%" },
  { upTo: 60, colour: "#5598e7", label: "40 to 60%" },
  { upTo: 101, colour: "#9ec5f4", label: "60% or more" },
] as const;

interface GrowthInfo {
  growthPct: number | null;
  prev: number | null;
  isNew: boolean;
  known: boolean;
}

function growthKind(g: GrowthInfo | undefined, signups: number): keyof typeof GROWTH_COLOURS {
  if (!g || !g.known) return "none";
  if (g.isNew) return "new";
  if (g.prev == null) return "none";
  if (g.growthPct == null) return signups > 0 ? "up" : "none"; // up from nothing
  if (g.growthPct >= 10) return "up";
  if (g.growthPct <= -10) return "down";
  return "flat";
}

function activeColour(p: AdminGeoMapPoint): string {
  if (!p.allTimeUsers) return GROWTH_COLOURS.none;
  const pct = (p.activeDrivers / p.allTimeUsers) * 100;
  return (ACTIVE_STEPS.find((s) => pct < s.upTo) ?? ACTIVE_STEPS[ACTIVE_STEPS.length - 1]).colour;
}

interface GeoMapProps {
  points: AdminGeoMapPoint[];
  areas: AdminGeoAreaRow[];
  districts: AdminGeoDistrictRow[];
  level: MapLevel;
  measure: MapMeasure;
  colour: MapColour;
  /** "in the last 30 days". */
  windowText: string;
  hasPrevious: boolean;
}

export function GeoMap({ points, areas, districts, level, measure, colour, windowText, hasPrevious }: GeoMapProps) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const [ready, setReady] = useState(0);

  const growth = useMemo(() => {
    const m = new Map<string, GrowthInfo>();
    for (const a of areas) m.set(`area:${a.area}`, { growthPct: a.growthPct, prev: a.prevSignups, isNew: a.newInWindow, known: true });
    for (const d of districts) m.set(`district:${d.district}`, { growthPct: d.growthPct, prev: d.prevSignups, isNew: false, known: true });
    return m;
  }, [areas, districts]);

  const userMovedRef = useRef(false);
  const fittingRef = useRef(false);
  const refit = useCallback((map: LeafletMap) => {
    map.invalidateSize();
    if (userMovedRef.current) return;
    fittingRef.current = true;
    map.fitBounds(UK_BOUNDS, { padding: [8, 8], animate: false });
    fittingRef.current = false;
  }, []);

  // Init once.
  useEffect(() => {
    let disposed = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (disposed || !elRef.current || mapRef.current) return;
      const map = L.map(elRef.current, { attributionControl: true, minZoom: 4, maxZoom: 12, zoomSnap: 0.25, scrollWheelZoom: false });
      addDarkBasemap(L, map);
      map.fitBounds(UK_BOUNDS, { padding: [8, 8] });
      // The box can still be settling when Leaflet measures it (the map opened
      // over Scandinavia on 2 Oct), so refit once layout has finished, and on
      // every resize until the viewer pans or zooms themselves.
      map.on("dragstart zoomstart", () => {
        if (fittingRef.current) return;
        userMovedRef.current = true;
      });
      requestAnimationFrame(() => refit(map));
      setTimeout(() => refit(map), 300);
      // Scroll-wheel zoom only after a click, so the page still scrolls past it.
      map.once("focus", () => map.scrollWheelZoom.enable());
      map.on("click", () => map.scrollWheelZoom.enable());
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady((n) => n + 1);
    })();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [refit]);

  // Keep the map sized to its box (sidebar toggles, phone rotation).
  useEffect(() => {
    const el = elRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const map = mapRef.current;
      if (map) refit(map);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [refit]);

  // Draw.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      const layer = layerRef.current;
      const el = elRef.current;
      if (cancelled || !layer || !el) return;
      layer.clearLayers();

      const shown = points.filter((p) => p.level === level);
      const value = (p: AdminGeoMapPoint) => (measure === "window" ? p.signups : p.allTimeUsers);
      const max = Math.max(1, ...shown.map(value));
      const narrow = el.clientWidth < 520;
      const maxR = (level === "area" ? 26 : 15) * (narrow ? 0.72 : 1);
      const radius = (v: number) => (v <= 0 ? 2.5 : 3.5 + Math.sqrt(v / max) * (maxR - 3.5));

      // Big circles first so small ones stay on top and clickable.
      const ordered = [...shown].sort((a, b) => value(b) - value(a));
      for (const p of ordered) {
        const v = value(p);
        const g = growth.get(`${p.level}:${p.code}`);
        const kind = growthKind(hasPrevious ? g : undefined, p.signups);
        const fill = colour === "growth" ? GROWTH_COLOURS[kind] : activeColour(p);
        const faint = v <= 0;
        const circle = L.circleMarker([p.lat, p.lng], {
          radius: radius(v),
          color: "rgba(3, 7, 18, 0.85)",
          weight: 1,
          fillColor: fill,
          fillOpacity: faint ? 0.35 : 0.78,
          opacity: faint ? 0.4 : 1,
        });

        const growthText =
          !hasPrevious || !g?.known
            ? null
            : g.isNew
              ? "New this window"
              : g.growthPct == null
                ? p.signups > 0
                  ? "Up from none"
                  : "None either window"
                : `${g.growthPct > 0 ? "+" : ""}${Math.round(g.growthPct)}%`;
        const activePct = p.allTimeUsers ? Math.round((p.activeDrivers / p.allTimeUsers) * 100) : null;
        const title = p.level === "area" ? `${p.code} ${p.label}` : p.label;
        circle.bindTooltip(
          `<div class="adm-geo-maptip__title">${escapeHtml(title)}</div>
           <div class="adm-geo-maptip__sub">${escapeHtml(p.region)}</div>
           <table>
             <tr><td>Sign-ups ${escapeHtml(windowText)}</td><td>${formatNumber(p.signups)}</td></tr>
             ${growthText ? `<tr><td>Change</td><td>${escapeHtml(growthText)}</td></tr>` : ""}
             <tr><td>All-time users</td><td>${formatNumber(p.allTimeUsers)}</td></tr>
             <tr><td>Drove in the last 7 days</td><td>${formatNumber(p.activeDrivers)}${activePct != null ? ` (${activePct}%)` : ""}</td></tr>
           </table>`,
          { className: "adm-geo-maptip", direction: "top", offset: [0, -radius(v)], opacity: 1 }
        );
        circle.on("click", () => circle.openTooltip());
        circle.addTo(layer);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [points, level, measure, colour, growth, windowText, hasPrevious, ready]);

  return (
    <div className="adm-geo-map">
      <div
        ref={elRef}
        className="adm-geo-map__canvas"
        role="region"
        aria-label="Map of the UK with a circle for each place drivers sign up from. The tables below list the same figures."
      />
    </div>
  );
}

/** Legend for the colour and size encoding. */
export function GeoMapLegend({ colour, measure, hasPrevious }: { colour: MapColour; measure: MapMeasure; hasPrevious: boolean }) {
  return (
    <div className="adm-geo-map__legend">
      <div className="adm-geo-legend" aria-label="Colour key">
        {colour === "growth" ? (
          hasPrevious ? (
            <>
              <Key c={GROWTH_COLOURS.new} t="First drivers ever" />
              <Key c={GROWTH_COLOURS.up} t="Growing" />
              <Key c={GROWTH_COLOURS.flat} t="Steady (within 10%)" />
              <Key c={GROWTH_COLOURS.down} t="Fewer than before" />
              <Key c={GROWTH_COLOURS.none} t="Not enough to compare" />
            </>
          ) : (
            <span>Pick a shorter window to colour by growth.</span>
          )
        ) : (
          <>
            {ACTIVE_STEPS.map((s) => (
              <Key key={s.label} c={s.colour} t={s.label} />
            ))}
            <span style={{ color: "var(--adm-text-3)" }}>of all-time users drove in the last 7 days</span>
          </>
        )}
      </div>
      <div className="adm-geo-legend" aria-label="Size key">
        <span className="adm-geo-legend__size">
          <i style={{ width: 6, height: 6 }} />
          <i style={{ width: 12, height: 12 }} />
          <i style={{ width: 20, height: 20 }} />
          Circle size: {measure === "window" ? "sign-ups in the window" : "all-time users"}
        </span>
      </div>
    </div>
  );
}

function Key({ c, t }: { c: string; t: string }) {
  return (
    <span className="adm-geo-legend__item">
      <span className="adm-geo-legend__dot" style={{ background: c }} />
      {t}
    </span>
  );
}
