"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { MapViewProps } from "./MapView";

// Leaflet comes from node_modules (bundled), never a CDN. Tiles are OSM's
// standard ones, darkened with CSS on the tile pane only (see kit.css).
export default function MapViewInner({ routes, markers, circles, onClick, height, fitTo = "routes" }: MapViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  const dataKey = JSON.stringify({ routes, markers, circles, fitTo });

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !host.current) return;
        map = L.map(host.current, { zoomControl: true, attributionControl: true }).setView([54.5, -2.5], 5);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);
        const bounds: [number, number][] = [];

        for (const r of routes ?? []) {
          if (r.coords.length < 2) continue;
          L.polyline(r.coords, {
            color: r.color ?? "#f5a623",
            weight: 4,
            opacity: 0.95,
            dashArray: r.dashed ? "6 8" : undefined,
          }).addTo(map);
          if (fitTo === "routes") bounds.push(...r.coords);
        }
        for (const m of markers ?? []) {
          const kind = m.kind ?? "place";
          const icon = L.divIcon({
            className: "mc-pin-wrap",
            html: `<span class="mc-pin mc-pin--${kind}"></span>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          });
          const mk = L.marker([m.lat, m.lng], { icon, keyboard: false }).addTo(map);
          if (m.label) mk.bindTooltip(m.label);
          if (fitTo === "markers" || fitTo === "routes") bounds.push([m.lat, m.lng]);
        }
        for (const c of circles ?? []) {
          L.circle([c.lat, c.lng], { radius: c.radiusM, color: "#f5a623", weight: 1.5, fillColor: "#f5a623", fillOpacity: 0.12 }).addTo(map);
          bounds.push([c.lat, c.lng]);
        }
        if (bounds.length > 0) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
        map.on("click", (e) => clickRef.current?.(e.latlng.lat, e.latlng.lng));
        setTimeout(() => map?.invalidateSize(), 50);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
    // dataKey covers routes, markers, circles and fitTo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  if (failed) {
    return (
      <div className="mc-map mc-map--empty" style={{ height }}>
        <p>The map couldn&apos;t load.</p>
      </div>
    );
  }
  return <div ref={host} className="mc-map" style={{ height }} tabIndex={0} aria-label="Map" />;
}
