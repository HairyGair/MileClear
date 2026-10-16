// Pure logic for scripts/dedupe-shared-fixes.mjs. No database, no imports, so
// it can be tested with fixture data (sharedFixes.test.mjs, `node --test`).
//
// Times are milliseconds since epoch. A fix is { id, t, lat, lng, speed, accuracy }.

export const OVERLAP_MIN_MS = 60 * 1000;
export const SHARED_RADIUS_MILES = 50 / 1609.344; // 50 m
export const MIN_SHARED_FIXES = 5;
export const REAL_STRETCH_MILES = 0.3;
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

/** Anchor-shaped: accuracy exactly 50 and speed 0. Neutral when finding stretches. */
export const isAnchorShaped = (f) => f.accuracy === 50 && f.speed === 0;

export function indexByMs(fixes) {
  const m = new Map();
  for (const f of fixes) {
    if (!m.has(f.t)) m.set(f.t, []);
    m.get(f.t).push(f);
  }
  return m;
}

/**
 * Which of `sorted` (one trip's fixes) are shared with `otherByMs` (a kept
 * trip's fixes): same exact ms AND within 50 m. The departure anchor never
 * counts. Returns the fix indexes and the number of distinct timestamps.
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

/** Trips (per driver) overlapping another by more than 60 s. { id, userId, startedAt, endedAt } in ms. */
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
        if (list[j].startedAt >= list[i].endedAt - OVERLAP_MIN_MS) break;
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
 * linked-row reasons). Nothing here is ever changed automatically. The
 * driver's classification is NOT one: it is carried to the keeper instead.
 */
export function rowReviewReasons(t) {
  const r = [];
  const gq = t.gpsQuality && typeof t.gpsQuality === "object" ? t.gpsQuality : {};
  if (t.shiftId) r.push("has a shift");
  if (t.odometerStart != null || t.odometerEnd != null) r.push("has odometer readings");
  if (gq.endExtension) r.push("end was extended or edited");
  if (t.splitFromTripId && !gq.autoSplitFromTripId) r.push("a split the driver made");
  if (t.joinedCount) r.push("a join the driver made");
  if ((t.notes && t.notes.trim()) || (t.businessPurpose && t.businessPurpose.trim()) || (t.projectLabel && t.projectLabel.trim()) || (t.category && t.category.trim())) {
    r.push("has a note, purpose, project or category");
  }
  return r;
}

export const SPAN_GAP_MS = 5 * 60 * 1000;
export const MIN_REAL_FIXES = 5;
export const MIN_REAL_SECONDS = 60;
export const ARCHIVE_COORDINATE_CAP = 6000; // tripArchive.ts: more rows than this are not fully archived
export const TIMING_ONLY_RATIO = 2;
export const BALANCE_SLACK_MILES = 0.3;

/**
 * Time-span coverage comes from the keeper's OWN fixes, never its saved
 * startedAt / endedAt (a stretched end time must not swallow a separate drive):
 * covered when the keeper has a fix at or before `t` and one at or after `t`,
 * each within 5 minutes of it. `times` is sorted ascending.
 */
export function insideOwnFixes(times, t) {
  let lo = 0;
  let hi = times.length; // first index with times[i] >= t
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo === times.length) return false; // nothing at or after
  const after = times[lo];
  if (after === t) return true;
  if (lo === 0) return false; // nothing before
  return after - t <= SPAN_GAP_MS && t - times[lo - 1] <= SPAN_GAP_MS;
}

/** Did the driver set this classification themselves? */
export const driverSetClassification = (t) =>
  t.classificationSource === "user" || t.classificationSource === "user_undo" || (t.classificationAutoAccepted ?? null) != null;

const isUnclassified = (c) => !c || c === "unclassified";
const round = (x) => Math.round(x * 100) / 100;
const classOf = (t) => ({
  classification: t.classification ?? "unclassified",
  classificationSource: t.classificationSource ?? null,
  classificationAutoAccepted: t.classificationAutoAccepted ?? null,
  platformTag: t.platformTag ?? null,
});

/**
 * Plan one driver's trips. `trips` are the driver's candidate trips:
 * { id, createdAt, startedAt, endedAt, distanceMiles, family, reviewReasons[], fixes[],
 *   classification, classificationSource, classificationAutoAccepted, platformTag }.
 *
 * COVERED rule (the server is getting the same one): a fix is covered when it
 * is exact-shared with a kept trip (same ms, within 50 m, from a pair with 5+
 * shared timestamps) OR it lies between two of that kept trip's own fixes that
 * are each within 5 minutes of it (insideOwnFixes; never the saved times). Uncovered fixes form contiguous stretches; anchor-shaped fixes
 * (accuracy 50, speed 0) neither break a stretch nor make one. A stretch's
 * miles = its own path plus the joining segment to the adjacent covered fix
 * (each join counted once); it is REAL at 0.3 mi or more.
 *   0 real stretches -> ARCHIVE;  1 -> TRIM to it;  2+ -> REVIEW.
 *
 * Items: { tripId, action, keeperIds, sharedFixes, reason, oldMiles, newMiles,
 *   removeFixIds, keepFixes, droppedStretches, keeperUpdate, reviewReasons, wouldBe }.
 */
export function planDriver(trips) {
  const famMin = new Map();
  for (const t of trips) famMin.set(t.family, Math.min(famMin.get(t.family) ?? Infinity, t.createdAt));
  const order = [...trips].sort(
    (a, b) => famMin.get(a.family) - famMin.get(b.family) || a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1)
  );

  const kept = []; // { id, byMs, start, end, classification, classificationSource, ... }
  const items = [];
  for (const t of order) {
    const sorted = sortFixes(t.fixes);
    const n = sorted.length;
    const covered = new Array(n).fill(false);
    const exact = new Set();
    const keeperIds = [];
    const sharedBy = new Map();
    for (const k of kept) {
      const { idx, distinct } = sharedWith(sorted, k.byMs);
      if (distinct < MIN_SHARED_FIXES) continue;
      keeperIds.push(k.id);
      sharedBy.set(k.id, distinct);
      for (const i of idx) { covered[i] = true; exact.add(i); }
      for (let i = 0; i < n; i++) if (!covered[i] && insideOwnFixes(k.times, sorted[i].t)) covered[i] = true;
    }
    const entry = (fixes) => {
      const fx = sortFixes(fixes);
      const byMs = indexByMs(fx);
      return { id: t.id, byMs, fixes: fx, times: [...byMs.keys()].sort((a, b) => a - b), locked: Boolean(t.monthLocked), ...classOf(t) };
    };
    if (keeperIds.length === 0) {
      kept.push(entry(sorted));
      continue;
    }
    const sharedFixes = exact.size;

    // Stretches over the non-anchor-shaped fixes only.
    const seq = [];
    for (let i = 0; i < n; i++) if (!isAnchorShaped(sorted[i])) seq.push(i);
    const stretches = [];
    let open = null;
    for (let s = 0; s < seq.length; s++) {
      if (covered[seq[s]]) { open = null; continue; }
      if (open) open.lastPos = s;
      else { open = { firstPos: s, lastPos: s }; stretches.push(open); }
    }
    for (const st of stretches) {
      const fx = [];
      for (let s = st.firstPos; s <= st.lastPos; s++) fx.push(sorted[seq[s]]);
      st.fixes = fx.length;
      st.fx = fx;
      st.seconds = (fx.at(-1).t - fx[0].t) / 1000;
      st.firstIdx = seq[st.firstPos];
      st.lastIdx = seq[st.lastPos];
      st.joinBefore = st.firstPos > 0 ? sorted[seq[st.firstPos - 1]] : null; // covered by construction
      st.joinAfter = st.lastPos < seq.length - 1 ? sorted[seq[st.lastPos + 1]] : null;
      let m = pathMiles(fx);
      if (st.joinBefore) m += haversineMiles(st.joinBefore.lat, st.joinBefore.lng, fx[0].lat, fx[0].lng);
      if (st.joinAfter) m += haversineMiles(fx.at(-1).lat, fx.at(-1).lng, st.joinAfter.lat, st.joinAfter.lng);
      st.miles = m;
    }
    const real = stretches.filter((s) => s.miles >= REAL_STRETCH_MILES);

    const base = { tripId: t.id, keeperIds, sharedFixes, oldMiles: t.distanceMiles };
    const fullPath = pathMiles(sorted);
    const unexplained = t.distanceMiles - fullPath > UNEXPLAINED_MILES;

    let plan;
    if (real.length > 1) {
      plan = { action: "REVIEW", reason: `${real.length} real stretches (${real.map((s) => s.miles.toFixed(2) + " mi").join(", ")}) outside the keepers`, newMiles: t.distanceMiles };
    } else if (real.length === 0) {
      plan = {
        action: "ARCHIVE",
        reason: `covered by ${keeperIds.length} keeper(s); ${stretches.length} small uncovered bit(s), ${stretches.reduce((a, s) => a + s.miles, 0).toFixed(2)} mi`,
        newMiles: 0,
        removeFixIds: sorted.map((f) => f.id),
        droppedStretches: stretches.map((s) => ({ fixes: s.fixes, miles: round(s.miles) })),
      };
    } else if (real[0].fixes < MIN_REAL_FIXES || real[0].seconds < MIN_REAL_SECONDS) {
      plan = { action: "REVIEW", reason: `the one stretch outside the keepers is ${real[0].miles.toFixed(2)} mi but only ${real[0].fixes} fixes over ${Math.round(real[0].seconds)} s`, newMiles: t.distanceMiles };
    } else {
      const st = real[0];
      // Anchor-shaped fixes are dropped, except the stretch's own first fix
      // when it sits directly before it, within 60 s.
      const prev = st.firstIdx > 0 ? sorted[st.firstIdx - 1] : null;
      const lead = prev && isAnchorShaped(prev) && !covered[st.firstIdx - 1] && st.fx[0].t - prev.t <= 60000 ? prev : null;
      const keepFixes = [...(st.joinBefore ? [st.joinBefore] : []), ...(lead ? [lead] : []), ...st.fx, ...(st.joinAfter ? [st.joinAfter] : [])];
      const keepIds = new Set(keepFixes.map((f) => f.id));
      plan = {
        action: "TRIM",
        reason: `${sharedFixes} shared fixes; one real stretch of ${st.miles.toFixed(2)} mi (${st.fixes} fixes) kept`,
        newMiles: Math.min(t.distanceMiles, pathMiles(keepFixes)),
        removeFixIds: sorted.filter((f) => !keepIds.has(f.id)).map((f) => f.id),
        keepFixes,
        droppedStretches: stretches.filter((s) => s !== st).map((s) => ({ fixes: s.fixes, miles: round(s.miles) })),
      };
    }

    const reviewReasons = [...(t.reviewReasons ?? [])];
    if (plan.action !== "REVIEW" && unexplained) {
      reviewReasons.push(`stored distance is ${(t.distanceMiles - fullPath).toFixed(1)} mi more than its fixes explain`);
    }

    const topId = [...sharedBy].sort((x, y) => y[1] - x[1])[0][0];
    const primary = kept.find((k) => k.id === topId);
    const keeperEntries = keeperIds.map((id) => kept.find((k) => k.id === id));

    if (plan.action !== "REVIEW") {
      if (n > ARCHIVE_COORDINATE_CAP) reviewReasons.push(`${n} coordinate rows (more than the ${ARCHIVE_COORDINATE_CAP} an archive holds)`);

      // Timing-only coverage must not let a sparse keeper stand in for dense driving.
      const timingOnly = [...covered.keys()].filter((i) => covered[i] && !exact.has(i)).length;
      if (timingOnly > TIMING_ONLY_RATIO * exact.size) {
        reviewReasons.push(`${timingOnly} fixes covered only by timing against ${exact.size} exact-shared`);
      }
      let copyMiles = 0;
      let keeperMiles = 0;
      let run = [];
      const flush = () => {
        if (run.length) {
          const a = run[0].t;
          const b = run.at(-1).t;
          copyMiles += pathMiles(run);
          // The keepers' own fixes in the same window, together (one per timestamp).
          const byT = new Map();
          for (const k of keeperEntries) for (const f of k.fixes) if (f.t >= a && f.t <= b && !byT.has(f.t)) byT.set(f.t, f);
          keeperMiles += pathMiles([...byT.values()].sort((x, y) => x.t - y.t));
        }
        run = [];
      };
      for (const i of seq) {
        if (covered[i]) run.push(sorted[i]);
        else flush();
      }
      flush();
      // Balance: miles taken off must be explained by covered driving, the small
      // bits dropped, and a little slack. Miles that travelled through anchor-shaped
      // fixes (neither stretch nor covered) would otherwise vanish unnoticed.
      const removedMiles = plan.action === "ARCHIVE" ? t.distanceMiles : t.distanceMiles - plan.newMiles;
      const droppedMiles = (plan.droppedStretches ?? []).reduce((a, s) => a + s.miles, 0);
      if (removedMiles > copyMiles + droppedMiles + BALANCE_SLACK_MILES) {
        reviewReasons.push(`removes ${removedMiles.toFixed(2)} mi but only ${copyMiles.toFixed(2)} mi are covered (+${droppedMiles.toFixed(2)} mi of small bits)`);
      }
      if (copyMiles - keeperMiles > 0.5 || copyMiles > keeperMiles * 1.1 + 0.01) {
        reviewReasons.push(`copy covers ${copyMiles.toFixed(2)} mi where the keeper(s) record ${keeperMiles.toFixed(2)} mi over the same time`);
      }

      // mileage.ts counts classification === "business" only.
      const copyBiz = t.classification === "business";
      if (keeperEntries.some((k) => (k.classification === "business") !== copyBiz)) {
        reviewReasons.push("business / non-business disagreement with a keeper");
      }
    }

    // The driver's classification must not be lost with the copy.
    let keeperUpdate;
    if (plan.action !== "REVIEW" && reviewReasons.length === 0 && driverSetClassification(t)) {
      const same = (primary.classification ?? "unclassified") === (t.classification ?? "unclassified");
      if (!same && !isUnclassified(primary.classification) && driverSetClassification(primary)) {
        reviewReasons.push("keeper and copy were classified differently by the driver");
      } else if (primary.locked) {
        reviewReasons.push("the keeper's month was approved by a team manager");
      } else {
        const set = {};
        if (!same || !driverSetClassification(primary)) {
          set.classification = t.classification;
          set.classificationSource = t.classificationSource;
        }
        if (t.platformTag && !primary.platformTag) set.platformTag = t.platformTag;
        if (Object.keys(set).length) {
          keeperUpdate = {
            keeperId: primary.id, set,
            old: { classification: primary.classification, classificationSource: primary.classificationSource, platformTag: primary.platformTag },
          };
        }
      }
    }

    if (plan.action !== "REVIEW" && reviewReasons.length) {
      plan = { ...plan, wouldBe: plan.action, action: "REVIEW", reason: `${plan.reason}; held back: ${reviewReasons.join(", ")}`, newMiles: t.distanceMiles };
      keeperUpdate = undefined;
    }
    items.push({ ...base, mainKeeperId: topId, ...plan, ...(keeperUpdate ? { keeperUpdate } : {}), reviewReasons });

    if (keeperUpdate) Object.assign(primary, keeperUpdate.set);
    // Later trips are compared against what this one will look like.
    if (plan.action === "TRIM") {
      kept.push(entry(plan.keepFixes));
    } else if (plan.action === "REVIEW") {
      kept.push(entry(sorted));
    } // ARCHIVE: gone, not kept
  }
  return items;
}

/** A copy of `row` with the named ISO-string keys turned back into Dates (null stays null). */
export function reviveDates(row, keys) {
  const out = { ...row };
  for (const k of keys) if (typeof out[k] === "string") out[k] = new Date(out[k]);
  return out;
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
