// Lays a trip's route out as short straight pieces inside a small square, for
// the Last trip card's thumbnail (SPEC-VISUAL 5.5). Drawn with plain Views, no
// map tiles and no SVG library, so a Home load never fetches a map. Pure and
// unit-tested.

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RoutePiece {
  /** Centre of the piece in the square, in points. */
  cx: number;
  cy: number;
  length: number;
  /** Degrees, clockwise from pointing right (React Native's rotate). */
  angleDeg: number;
}

export interface RouteDrawing {
  pieces: RoutePiece[];
  start: { x: number; y: number } | null;
  end: { x: number; y: number } | null;
}

const EMPTY: RouteDrawing = { pieces: [], start: null, end: null };

/**
 * @param route    the recorded points, or empty
 * @param start    trip start, used when there is no route
 * @param end      trip end, used when there is no route
 * @param size     width and height of the square, in points
 * @param pad      empty margin inside the square
 * @param dashed   draw a dashed line (a trip added by hand, no recorded route)
 */
export function layoutRoute(args: {
  route: LatLng[];
  start: LatLng | null;
  end: LatLng | null;
  size: number;
  pad?: number;
  dashed?: boolean;
}): RouteDrawing {
  const pad = args.pad ?? 8;
  let pts: LatLng[] = args.route.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (pts.length < 2) {
    pts = [args.start, args.end].filter((p): p is LatLng => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  }
  if (pts.length < 2) return EMPTY;

  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of pts) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  const midLat = (minLat + maxLat) / 2;
  const lngScale = Math.cos((midLat * Math.PI) / 180);
  const spanX = Math.max((maxLng - minLng) * lngScale, 1e-7);
  const spanY = Math.max(maxLat - minLat, 1e-7);
  const inner = Math.max(1, args.size - pad * 2);
  const scale = inner / Math.max(spanX, spanY);
  const offX = pad + (inner - spanX * scale) / 2;
  const offY = pad + (inner - spanY * scale) / 2;

  const xy = pts.map((p) => ({
    x: offX + (p.lng - minLng) * lngScale * scale,
    y: offY + (maxLat - p.lat) * scale,
  }));

  const pieces: RoutePiece[] = [];
  const DASH = 3;
  for (let i = 1; i < xy.length; i++) {
    const a = xy[i - 1];
    const b = xy[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.2) continue;
    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (!args.dashed) {
      pieces.push({ cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, length: len, angleDeg });
      continue;
    }
    for (let d = 0; d < len; d += DASH * 2) {
      const l = Math.min(DASH, len - d);
      const t = (d + l / 2) / len;
      pieces.push({ cx: a.x + dx * t, cy: a.y + dy * t, length: l, angleDeg });
    }
  }

  return { pieces, start: xy[0], end: xy[xy.length - 1] };
}
