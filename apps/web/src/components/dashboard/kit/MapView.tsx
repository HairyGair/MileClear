"use client";

import dynamic from "next/dynamic";

export interface MapViewProps {
  routes?: { coords: [number, number][]; color?: string; dashed?: boolean }[];
  markers?: { lat: number; lng: number; label?: string; kind?: "start" | "end" | "place" }[];
  circles?: { lat: number; lng: number; radiusM: number }[];
  onClick?: (lat: number, lng: number) => void;
  height: number;
  fitTo?: "routes" | "markers";
}

const Inner = dynamic(() => import("./MapViewInner"), {
  ssr: false,
  loading: () => <div className="mc-map mc-map--empty" aria-busy="true" />,
});

/**
 * Leaflet map, loaded on demand. Leaflet and its CSS are bundled from npm
 * (no unpkg). OSM tiles are darkened by CSS. Shows a plain panel if it fails.
 * Give it no coordinates and it shows the "No route recorded" panel.
 *
 *   <MapView height={280} routes={[{ coords }]} markers={[{ lat, lng, kind: "start" }]} />
 */
export function MapView(props: MapViewProps) {
  const hasData = (props.routes?.some((r) => r.coords.length > 1) ?? false) || (props.markers?.length ?? 0) > 0 || (props.circles?.length ?? 0) > 0 || !!props.onClick;
  if (!hasData) {
    return (
      <div className="mc-map mc-map--empty" style={{ height: props.height }}>
        <p>No route recorded for this trip</p>
      </div>
    );
  }
  return <Inner {...props} />;
}
