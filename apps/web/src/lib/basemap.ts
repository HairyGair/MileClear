import type * as Leaflet from "leaflet";

/** Dark basemap for the dashboard maps.
 *
 *  CARTO's free dark_all tiles started watermarking "API KEY REQUIRED" across
 *  every tile in August 2026. OpenStreetMap's standard tiles need no key; the
 *  `mc-dark-tiles` class (dashboard.css) inverts and desaturates them so the
 *  map still sits on the navy dashboard. Attribution is a condition of using
 *  OSM tiles, so it is set here and not per call site. */
export function addDarkBasemap(L: typeof Leaflet, map: Leaflet.Map): Leaflet.TileLayer {
  return L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    className: "mc-dark-tiles",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
}
