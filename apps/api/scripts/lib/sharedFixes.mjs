// Pure logic for scripts/dedupe-shared-fixes.mjs. No database, no imports, so
// it can be tested with fixture data (sharedFixes.test.mjs, `node --test`).
//
// Times are milliseconds since epoch. A fix is { id, t, lat, lng, speed, accuracy }.

export const OVERLAP_MIN_MS = 60 * 1000;
export const SHARED_RADIUS_MILES = 50 / 1609.344; // 50 m
export const MIN_SHARED_FIXES = 5;
export const MIN_REMAINDER_FIXES = 2;
export const MIN_REMAINDER_MILES = 0.3;
// A stored distance this far above what the fixes explain means something else
// (an end edit, a typed distance) lives in the trip; never changed automatically.
export const UNEXPLAINED_MILES = 0.5;

export function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function sortFixes(fixes) {
  return [...fixes].sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function pathMiles(fixes) {
  let m = 0;
  for (let i = 1; i < fixes.length; i++) {
    m += haversineMiles(fixes[i - 1].lat, fixes[i - 1].lng, fixes[i].lat, fixes[i].lng);
  }
  return m;
}

/** The synthetic departure anchor: first fix, accuracy exactly 50, speed 0, ~30 s before the next. */
export function isAnchor(sorted, i) {
  if (i !== 0 || sorted.length < 2) return false;
  const f = sorted[0];
  const gap = sorted[1].t - f.t;
  return f.accuracy === 50 && f.speed === 0 && gap >= 15000 && gap <= 45000;
}

export function indexByMs(fixes) {
  const m = new Map();
  for (const f of fixes) {
    if (!m.has(f.t)) m.set(f.t, []);
    m.get(f.t).push(f);
  }
  return m;
}

/**
 * Which of `fixes` (sorted, one trip) are shared with `other` (a kept trip's
 * fixes, as indexByMs): same exact ms AND within 50 m. Anchors never count.
 * Returns the set of fix indexes and the number of distinct timestamps shared.
 */
export function sharedWith(sorted, otherByMs) {
  const idx = new Set();
  const stamps = new Set();
  for (let i = 0; i < sorted.length; i++) {
    if (isAnchor(sorted, i)) continue;
    const cands = otherByMs.get(sorted[i].t);
    if (!cands) continue;
    if (cands.some((c) => haversineMiles(sorted[i].lat, sorted[i].lng, c.lat, c.lng) <= SHARED_RADIUS_MILES)) {
      idx.add(i);
      stamps.add(sorted[i].t);
    }
  }
  return { idx, distinct: stamps.size };
}

/** Pairs (per driver) overlapping by more than 60 s. Trips: { id, userId, startedAt, endedAt } in ms. */
export function candidateTripIds(trips) {
  const byUser = new Map();
  for (const t of trips) {
    if (!byUser.has(t.userId)) byUser.set(t.userId, []);
    byUser.get(t.userId).push(t);
  }
  const ids = new Set();
  for (const list of byUser.values()) {
    list.sort((a, b) => a.startedAt - b.startedAt);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (list[j].startedAt >= list[i].endedAt - OVERLAP_MIN_MS) break; // sorted by start: nothing later can overlap i enough
        const overlap = Math.min(list[i].endedAt, list[j].endedAt) - list[j].startedAt;
        if (overlap > OVERLAP_MIN_MS) {
          ids.add(list[i].id);
          ids.add(list[j].id);
        }
      }
    }
  }
  return ids;
}

/** A visit-auto-split tail belongs to its parent's family; everything else is its own. */
export function familyRoot(gpsQuality, id) {
  const gq = gpsQuality && typeof gpsQuality === "object" ? gpsQuality : {};
  return gq.autoSplitFromTripId || id;
}

/**
 * Review reasons that need only the trip row (the caller adds event and
 * linked-row reasons). Nothing here is ever changed automatically.
 */
export function rowReviewReasons(t) {
  const r = [];
  const gq = t.gpsQuality && typeof t.gpsQuality === "object" ? t.gpsQuality : {};
  if (t.shiftId) r.push("has a shift");
  if (t.odometerStart != null || t.odometerEnd != null) r.push("has odometer readings");
  if (gq.endExtension) r.push("end was extended or edited");
  if (t.splitFromTripId && !gq.autoSplitFromTripId) r.push("a split the driver made");
  if (t.joinedCount) r.push("a join the driver made");
  if (t.classificationSource === "user" || t.classificationSource === "user_undo" || t.classificationAutoAccepted != null) {
    r.push("classification set by the driver");
  }
  if ((t.notes && t.notes.trim()) || (t.businessPurpose && t.businessPurpose.trim()) || (t.projectLabel && t.projectLabel.trim()) || (t.category && t.category.trim())) {
    r.push("has a note, purpose, project or category");
  }
  return r;
}

/**
 * Plan one driver's trips. `trips` are the driver's candidate trips:
 * { id, createdAt, startedAt, endedAt, distanceMiles, family, reviewReasons[], fixes[] }.
 * Returns items: { tripId, action: TRIM|ARCHIVE|REVIEW, keeperIds, sharedFixes, reason,
 *   oldMiles, newMiles, removeFixIds, keepFixes, reviewReasons, wouldBe }.
 */
export function planDriver(trips) {
  const famMin = new Map();
  for (const t of trips) famMin.set(t.family, Math.min(famMin.get(t.family) ?? Infinity, t.createdAt));
  const order = [...trips].sort(
    (a, b) => famMin.get(a.family) - famMin.get(b.family) || a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1)
  );

  const kept = []; // { id, byMs }
  const items = [];
  for (const t of order) {
    const sorted = sortFixes(t.fixes);
    const removed = new Set();
    const keeperIds = [];
    for (const k of kept) {
      const { idx, distinct } = sharedWith(sorted, k.byMs);
      if (distinct < MIN_SHARED_FIXES) continue;
      keeperIds.push(k.id);
      for (const i of idx) removed.add(i);
    }
    if (removed.size === 0) {
      kept.push({ id: t.id, byMs: indexByMs(sorted) });
      continue;
    }
    // The anchor goes with the shared stretch it leads into.
    if (isAnchor(sorted, 0) && removed.has(1)) removed.add(0);

    const stretches = [];
    let cur = null;
    for (let i = 0; i < sorted.length; i++) {
      if (removed.has(i)) { cur = null; continue; }
      if (!cur) { cur = []; stretches.push(cur); }
      cur.push(i);
    }
    const sharedFixes = removed.size;
    const base = { tripId: t.id, keeperIds, sharedFixes, oldMiles: t.distanceMiles };
    const fullPath = pathMiles(sorted);
    const unexplained = t.distanceMiles - fullPath > UNEXPLAINED_MILES;

    let plan;
    if (stretches.length > 1) {
      plan = { action: "REVIEW", reason: `${stretches.length} separate stretches remain after the shared fixes`, newMiles: t.distanceMiles };
    } else {
      const stretch = (stretches[0] ?? []).map((i) => sorted[i]);
      const stretchMiles = pathMiles(stretch);
      if (stretch.length < MIN_REMAINDER_FIXES || stretchMiles < MIN_REMAINDER_MILES) {
        plan = {
          action: "ARCHIVE",
          reason: `only ${stretch.length} fix(es), ${stretchMiles.toFixed(2)} mi left after ${sharedFixes} shared fixes`,
          newMiles: 0,
          removeFixIds: sorted.map((f) => f.id),
        };
      } else {
        const first = stretches[0][0];
        const last = stretches[0][stretches[0].length - 1];
        const joinBefore = first > 0 && removed.has(first - 1) && !isAnchor(sorted, first - 1) ? sorted[first - 1] : null;
        const joinAfter = last < sorted.length - 1 && removed.has(last + 1) ? sorted[last + 1] : null;
        const keepFixes = [...(joinBefore ? [joinBefore] : []), ...stretch, ...(joinAfter ? [joinAfter] : [])];
        const keepIds = new Set(keepFixes.map((f) => f.id));
        const newMiles = Math.min(t.distanceMiles, pathMiles(keepFixes));
        plan = {
          action: "TRIM",
          reason: `${sharedFixes} shared fixes removed, ${stretch.length} kept${joinBefore || joinAfter ? " plus a joining fix" : ""}`,
          newMiles,
          removeFixIds: sorted.filter((f) => !keepIds.has(f.id)).map((f) => f.id),
          keepFixes,
        };
      }
    }

    const reviewReasons = [...(t.reviewReasons ?? [])];
    if ((plan.action === "TRIM" || plan.action === "ARCHIVE") && unexplained) {
      reviewReasons.push(`stored distance is ${(t.distanceMiles - fullPath).toFixed(1)} mi more than its fixes explain`);
    }
    if (plan.action !== "REVIEW" && reviewReasons.length) {
      plan = { ...plan, wouldBe: plan.action, action: "REVIEW", reason: `${plan.reason}; held back: ${reviewReasons.join(", ")}`, newMiles: t.distanceMiles };
    }
    items.push({ ...base, ...plan, reviewReasons });

    // Later trips are compared against what this one will look like.
    if (plan.action === "TRIM") {
      kept.push({ id: t.id, byMs: indexByMs(plan.keepFixes) });
    } else if (plan.action === "REVIEW") {
      kept.push({ id: t.id, byMs: indexByMs(sorted) });
    } // ARCHIVE: gone, not kept
  }
  return items;
}

/** The trip's new row values after a TRIM. `old` holds the current row. */
export function trimmedTripFields(old, keepFixes) {
  const sorted = sortFixes(keepFixes);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const sameEnd = old.endLat === last.lat && old.endLng === last.lng;
  const sameStart = old.startLat === first.lat && old.startLng === first.lng;
  return {
    startedAt: new Date(first.t),
    endedAt: new Date(last.t),
    startLat: first.lat,
    startLng: first.lng,
    endLat: last.lat,
    endLng: last.lng,
    startAddress: sameStart ? old.startAddress : null,
    endAddress: sameEnd ? old.endAddress : null,
    coordinateCount: sorted.length,
  };
}
