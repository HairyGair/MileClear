// Destination search behind a small interface (PLAN F5 / DESIGN Q1): today
// the app's existing search (Google Places autocomplete, then the server
// geocoder); swapping to a self-hosted Photon later means one new provider,
// not a new screen. A UK postcode is looked up first (postcodes.io).

import {
  forwardGeocodeMultiple,
  newSessionToken,
  placeDetails,
  placesAutocomplete,
} from "../location/geocoding";
import { lookupPostcode } from "../location/postcodes";

export interface PlaceResult {
  id: string;
  title: string;
  subtitle: string | null;
  /** Known straight away (postcode, geocoder) or after resolve(). */
  lat?: number;
  lng?: number;
}

export interface PlaceSearchProvider {
  search(query: string, near: { lat: number; lng: number } | null): Promise<PlaceResult[]>;
  /** Coordinates for a result that came without them. */
  resolve(r: PlaceResult): Promise<{ lat: number; lng: number; label: string } | null>;
}

/** A full UK postcode ("SR1 3AB", "sr13ab"). */
export function looksLikePostcode(q: string): boolean {
  return /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(q.trim());
}

/** The app's existing search, as the place pickers use it. */
export function existingSearchProvider(): PlaceSearchProvider {
  let session = newSessionToken();
  return {
    async search(query, near) {
      const q = query.trim();
      if (q.length < 3) return [];
      if (looksLikePostcode(q)) {
        const pc = await lookupPostcode(q);
        if (pc) {
          return [{ id: `pc:${pc.postcode}`, title: pc.postcode, subtitle: pc.adminDistrict || null, lat: pc.lat, lng: pc.lng }];
        }
      }
      const preds = await placesAutocomplete(q, session, near);
      if (preds.length > 0) {
        return preds.map((p) => ({ id: `gp:${p.placeId}`, title: p.primary, subtitle: p.secondary || null }));
      }
      const geo = await forwardGeocodeMultiple(q);
      return geo.map((g, i) => ({ id: `geo:${i}`, title: g.address ?? q, subtitle: null, lat: g.lat, lng: g.lng }));
    },
    async resolve(r) {
      if (r.lat != null && r.lng != null) return { lat: r.lat, lng: r.lng, label: r.title };
      if (!r.id.startsWith("gp:")) return null;
      const d = await placeDetails(r.id.slice(3), session);
      session = newSessionToken();
      return d ? { lat: d.lat, lng: d.lng, label: r.title } : null;
    },
  };
}
