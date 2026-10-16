// Run: node --test apps/api/scripts/lib/sharedFixes.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { planDriver, candidateTripIds, isAnchor, sortFixes, trimmedTripFields, rowReviewReasons } from "./sharedFixes.mjs";

const T0 = Date.parse("2026-10-15T15:00:00Z");
// A drive heading north: one fix every 10 s, ~78 m apart (about 0.048 mi each).
const fix = (n) => ({ id: `f${n}`, t: T0 + n * 10000, lat: 52 + n * 0.0007, lng: -1, speed: 10, accuracy: 8 });
const run = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => fix(from + i));
const copyOf = (fixes, p) => fixes.map((f, i) => ({ ...f, id: `${p}${i}` }));
const trip = (id, createdAt, fixes, extra = {}) => ({
  id, createdAt, family: id, distanceMiles: 0, reviewReasons: [], fixes,
  startedAt: fixes[0]?.t, endedAt: fixes.at(-1)?.t, ...extra,
});
const miles = (n) => n * 0.0483;

test("copy fully inside keeper is archived", () => {
  const a = run(0, 40);
  const b = copyOf(a.slice(5, 30), "b");
  const items = planDriver([trip("A", 1, a, { distanceMiles: miles(40) }), trip("B", 2, b, { distanceMiles: miles(25) })]);
  assert.equal(items.length, 1);
  assert.equal(items[0].action, "ARCHIVE");
  assert.deepEqual(items[0].keeperIds, ["A"]);
});

test("copy that carries on past the keeper is trimmed, keeping one joining fix", () => {
  const a = run(0, 30);
  const b = copyOf([...a.slice(10, 31), ...run(31, 80)], "b");
  const items = planDriver([trip("A", 1, a, { distanceMiles: miles(30) }), trip("B", 2, b, { distanceMiles: miles(70) })]);
  assert.equal(items[0].action, "TRIM");
  assert.equal(items[0].keepFixes.length, 51); // fixes 31..80 plus the join at 30
  assert.equal(items[0].keepFixes[0].t, T0 + 30 * 10000);
  assert.ok(Math.abs(items[0].newMiles - miles(50)) < 0.05, String(items[0].newMiles));
  assert.equal(items[0].removeFixIds.length, 20);
});

test("fewer than 5 shared fixes is ignored", () => {
  const a = run(0, 10);
  const b = copyOf([...a.slice(7), ...run(11, 40)], "b");
  assert.deepEqual(planDriver([trip("A", 1, a), trip("B", 2, b)]), []);
});

test("same time but more than 50 m apart is not shared", () => {
  const a = run(0, 20);
  const b = copyOf(a, "b").map((f) => ({ ...f, lng: f.lng + 0.001 })); // about 68 m
  assert.deepEqual(planDriver([trip("A", 1, a), trip("B", 2, b)]), []);
});

test("synthetic departure anchor does not count as shared and goes with the shared stretch", () => {
  const a = run(0, 20);
  const anchor = { id: "anc", t: T0 + 20000 - 30000, lat: 52, lng: -1, speed: 0, accuracy: 50 };
  const bFixes = [anchor, ...copyOf(a.slice(2, 20), "b")];
  assert.equal(isAnchor(sortFixes(bFixes), 0), true);
  const items = planDriver([trip("A", 1, a, { distanceMiles: miles(20) }), trip("B", 2, bFixes, { distanceMiles: miles(18) })]);
  assert.equal(items[0].action, "ARCHIVE");
  assert.ok(items[0].removeFixIds.includes("anc"));
});

test("two stretches left goes to review", () => {
  const a = run(10, 20);
  const b = copyOf(run(0, 40), "b");
  const items = planDriver([trip("A", 1, a, { distanceMiles: miles(10) }), trip("B", 2, b, { distanceMiles: miles(40) })]);
  assert.equal(items[0].action, "REVIEW");
  assert.match(items[0].reason, /separate stretches/);
});

test("a triple overlap resolves one at a time against what is kept", () => {
  const a = run(0, 30);
  const b = copyOf([...a.slice(10), ...run(31, 60)], "b");
  const c = copyOf([...a.slice(20), ...run(31, 60), ...run(61, 90)], "c");
  const items = planDriver([
    trip("A", 1, a, { distanceMiles: miles(30) }),
    trip("B", 2, b, { distanceMiles: miles(50) }),
    trip("C", 3, c, { distanceMiles: miles(70) }),
  ]);
  const byId = Object.fromEntries(items.map((i) => [i.tripId, i]));
  assert.equal(byId.B.action, "TRIM");
  assert.equal(byId.C.action, "TRIM");
  assert.deepEqual([...byId.C.keeperIds].sort(), ["A", "B"]);
  assert.equal(byId.C.keepFixes.length, 31); // 61..90 plus the join at 60
});

test("a visit-split tail counts as part of its family: the tail is the keeper, not the earlier-saved copy", () => {
  const whole = run(0, 60);
  const head = copyOf(whole.slice(0, 30), "h");
  const tail = copyOf(whole.slice(30), "t");
  const copy = copyOf(whole.slice(30), "c");
  const items = planDriver([
    trip("PARENT", 10, head, { distanceMiles: miles(30) }),
    trip("TAIL", 50, tail, { distanceMiles: miles(30), family: "PARENT" }),
    trip("COPY", 20, copy, { distanceMiles: miles(30) }),
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].tripId, "COPY");
  assert.deepEqual(items[0].keeperIds, ["TAIL"]);
});

test("driver-edited trips are held for review with what would have happened", () => {
  const a = run(0, 40);
  const b = copyOf(a.slice(5, 30), "b");
  const items = planDriver([trip("A", 1, a, { distanceMiles: miles(40) }), trip("B", 2, b, { distanceMiles: miles(25), reviewReasons: ["has a shift"] })]);
  assert.equal(items[0].action, "REVIEW");
  assert.equal(items[0].wouldBe, "ARCHIVE");
});

test("stored distance the fixes do not explain is held for review", () => {
  const a = run(0, 40);
  const b = copyOf(a.slice(5, 30), "b");
  const items = planDriver([trip("A", 1, a), trip("B", 2, b, { distanceMiles: miles(25) + 5 })]);
  assert.equal(items[0].action, "REVIEW");
});

test("candidate pairs need more than 60 s of overlap", () => {
  const mk = (id, s, e) => ({ id, userId: "u", startedAt: s, endedAt: e });
  // a/b overlap 10 s, b/c overlap 50 s: neither counts. c/d overlap 100 s: counts.
  const ids = candidateTripIds([mk("a", 0, 100000), mk("b", 90000, 200000), mk("c", 150000, 400000), mk("d", 300000, 500000)]);
  assert.deepEqual([...ids].sort(), ["c", "d"]);
});

test("review reasons from the row", () => {
  assert.deepEqual(rowReviewReasons({ gpsQuality: { autoSplitFromTripId: "x" }, splitFromTripId: "x" }), []);
  assert.ok(rowReviewReasons({ shiftId: "s" }).includes("has a shift"));
  assert.equal(rowReviewReasons({ classificationSource: "user" }).length, 1);
  assert.equal(rowReviewReasons({ splitFromTripId: "x", gpsQuality: {} }).length, 1);
  assert.equal(rowReviewReasons({ odometerEnd: 12 }).length, 1);
  assert.equal(rowReviewReasons({ classification: "business", classificationSource: "pattern_learning" }).length, 0);
});

test("trimmed fields keep the end address only when the end is unchanged", () => {
  const f = run(30, 80);
  const old = { startLat: 52, startLng: -1, endLat: f.at(-1).lat, endLng: f.at(-1).lng, startAddress: "S", endAddress: "E" };
  const n = trimmedTripFields(old, f);
  assert.equal(n.endAddress, "E");
  assert.equal(n.startAddress, null);
  assert.equal(n.coordinateCount, 51);
});
