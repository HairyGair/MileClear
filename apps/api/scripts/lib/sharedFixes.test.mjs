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
  assert.match(items[0].reason, /real stretches/);
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

// Fixes that crawl: about 8 m apart, so a run of them is a fraction of a mile.
const slowFrom = (from, to, baseIdx) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ ...fix(from + i), lat: 52 + baseIdx * 0.0007 + (i + 1) * 0.00007 }));

test("real shape 3f652a2b: shared core, a keeper whose time span covers the unshared bits inside, one real tail", () => {
  const X = run(0, 200);
  const k1 = copyOf(run(0, 117), "k1");
  // k2 shares only 6 exact fixes (145..150) but its time span runs 118+3 s to fix 150
  const k2 = [...Array.from({ length: 27 }, (_, i) => ({ ...fix(119 + i), id: `k2s${i}`, t: fix(119 + i).t + 3000 })), ...copyOf(run(145, 150), "k2e")];
  const items = planDriver([
    trip("K1", 1, k1, { distanceMiles: miles(117) }),
    trip("K2", 2, k2, { distanceMiles: miles(32) }),
    trip("X", 3, copyOf(X, "x"), { distanceMiles: miles(200) }),
  ]);
  const x = items.find((i) => i.tripId === "X");
  assert.equal(x.action, "TRIM");
  assert.deepEqual([...x.keeperIds].sort(), ["K1", "K2"]);
  assert.equal(x.keepFixes[0].t, T0 + 150 * 10000); // joining fix is the last covered one
  assert.equal(x.keepFixes.length, 51);
  assert.ok(x.droppedStretches.length >= 1 && x.droppedStretches.every((s) => s.miles < 0.3));
});

test("real shape ecd864fc: small bit | long shared core | small bit is archived", () => {
  const head = run(0, 2);
  const core = run(3, 61);
  const tail = slowFrom(62, 92, 61);
  const X = copyOf([...head, ...core, ...tail], "x");
  const items = planDriver([
    trip("K", 1, copyOf(core, "k"), { distanceMiles: miles(59) }),
    trip("X", 2, X, { distanceMiles: miles(60) }),
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].action, "ARCHIVE");
  assert.equal(items[0].droppedStretches.length, 2);
});

test("real shape 6932d6c7: 310 shared fixes with small bits either side is archived", () => {
  const core = run(12, 321);
  const head = run(0, 11).map((f, i) => ({ ...f, lat: fix(12).lat - (12 - i) * 0.00007 }));
  const X = copyOf([...head, ...core, ...slowFrom(322, 367, 321)], "x");
  const items = planDriver([
    trip("K", 1, copyOf(core, "k"), { distanceMiles: miles(310) }),
    trip("X", 2, X, { distanceMiles: miles(310) }),
  ]);
  assert.equal(items[0].action, "ARCHIVE");
});

test("anchor-shaped fixes never make a real stretch alone and do not break one", () => {
  const core = run(0, 30);
  const anchorLike = (n) => ({ id: `an${n}`, t: T0 + n * 10000 + 500, lat: 52 + n * 0.0007, lng: -1, speed: 0, accuracy: 50 });
  // uncovered tail of 1 slow fix plus anchor-shaped fixes far apart: still small
  const items = planDriver([
    trip("K", 1, copyOf(core, "k"), { distanceMiles: miles(30) }),
    trip("X", 2, copyOf([...core, anchorLike(40), anchorLike(50)], "x"), { distanceMiles: miles(30) }),
  ]);
  assert.equal(items[0].action, "ARCHIVE");
  // inside a real stretch an anchor-shaped fix does not split it
  const mid = [...run(31, 45), anchorLike(46), ...run(47, 70)];
  const items2 = planDriver([
    trip("K", 1, copyOf(core, "k"), { distanceMiles: miles(30) }),
    trip("X", 2, copyOf([...core, ...mid], "x"), { distanceMiles: miles(70) }),
  ]);
  assert.equal(items2[0].action, "TRIM");
});

test("a keeper's stretched endedAt does not swallow a separate drive: coverage comes from its own fixes", () => {
  // keeper fixes 09:00-09:40, saved endedAt 13:00 (stuck recording / end edit)
  const keeperFixes = run(0, 240);
  const drive = Array.from({ length: 181 }, (_, i) => ({ ...fix(1080 + i), lat: fix(5).lat + (i + 1) * 0.0007 })); // 12:00-12:30
  const copy = copyOf([...run(0, 5), ...drive], "x");
  const items = planDriver([
    trip("K", 1, keeperFixes, { distanceMiles: miles(240), endedAt: T0 + 4 * 3600 * 1000 }),
    trip("X", 2, copy, { distanceMiles: miles(186) }),
  ]);
  assert.equal(items[0].action, "TRIM");
  assert.equal(items[0].keepFixes.length, 182); // the drive plus the joining fix (the last shared one)
  assert.equal(items[0].keepFixes[0].t, T0 + 5 * 10000);
  assert.equal(items[0].keepFixes.at(-1).t, T0 + 1260 * 10000);
});

test("a keeper with a 20 minute gap in its own fixes does not cover copy fixes inside the gap", () => {
  const keeperFixes = [...run(0, 60), ...run(181, 240)]; // nothing from 10 min to 30 min
  const copy = copyOf([...run(0, 5), ...run(70, 170)], "x");
  const items = planDriver([
    trip("K", 1, keeperFixes, { distanceMiles: miles(120) }),
    trip("X", 2, copy, { distanceMiles: miles(106) }),
  ]);
  assert.equal(items[0].action, "TRIM");
  assert.ok(items[0].keepFixes.some((f) => f.t === T0 + 100 * 10000), "fix deep in the gap is kept");
});

test("fixes between keeper fixes that are each within 5 minutes are covered", () => {
  const keeperFixes = run(0, 60).filter((f) => f.t % 20000 === T0 % 20000); // every 20 s
  const copy = copyOf(run(0, 60), "x"); // the odd ones are not exact-shared
  const items = planDriver([
    trip("K", 1, keeperFixes, { distanceMiles: miles(60) }),
    trip("X", 2, copy, { distanceMiles: miles(60) }),
  ]);
  assert.equal(items[0].action, "ARCHIVE");
});

test("two real stretches outside the keepers goes to review", () => {
  const core = run(20, 40);
  const items = planDriver([
    trip("K", 1, copyOf(core, "k"), { distanceMiles: miles(20) }),
    trip("X", 2, copyOf(run(0, 60), "x"), { distanceMiles: miles(60) }),
  ]);
  assert.equal(items[0].action, "REVIEW");
});

const cls = (classification, classificationSource, extra = {}) => ({ classification, classificationSource, ...extra });

test("driver's classification is carried to an unclassified keeper", () => {
  const a = run(0, 40);
  const items = planDriver([
    trip("K", 1, a, { distanceMiles: miles(40), ...cls("unclassified", null) }),
    trip("X", 2, copyOf(a, "x"), { distanceMiles: miles(40), platformTag: "uber", ...cls("personal", "user") }),
  ]);
  assert.equal(items[0].action, "ARCHIVE");
  assert.equal(items[0].mainKeeperId, "K");
  assert.deepEqual(items[0].keeperUpdate.set, { classification: "personal", classificationSource: "user", platformTag: "uber" });
  assert.equal(items[0].keeperUpdate.old.classification, "unclassified");
});

test("same classification on the keeper: nothing to carry over", () => {
  const a = run(0, 40);
  const items = planDriver([
    trip("K", 1, a, { distanceMiles: miles(40), ...cls("business", "user") }),
    trip("X", 2, copyOf(a, "x"), { distanceMiles: miles(40), ...cls("business", "user") }),
  ]);
  assert.equal(items[0].action, "ARCHIVE");
  assert.equal(items[0].keeperUpdate, undefined);
});

test("keeper and copy both classified differently by the driver is held for review", () => {
  const a = run(0, 40);
  const items = planDriver([
    trip("K", 1, a, { distanceMiles: miles(40), ...cls("personal", "user") }),
    trip("X", 2, copyOf(a, "x"), { distanceMiles: miles(40), ...cls("business", "user") }),
  ]);
  assert.equal(items[0].action, "REVIEW");
  assert.equal(items[0].wouldBe, "ARCHIVE");
});

test("keeper auto-classified differently (both non-business): the driver's choice wins", () => {
  const a = run(0, 40);
  const items = planDriver([
    trip("K", 1, a, { distanceMiles: miles(40), ...cls("commute", "pattern_learning") }),
    trip("X", 2, copyOf(a, "x"), { distanceMiles: miles(40), ...cls("personal", "user") }),
  ]);
  assert.equal(items[0].action, "ARCHIVE");
  assert.equal(items[0].keeperUpdate.set.classification, "personal");
  assert.equal(items[0].keeperUpdate.old.classification, "commute");
});

test("business vs non-business disagreement is held for review whatever the source", () => {
  const a = run(0, 40);
  for (const [kc, ks, xc, xs] of [["unclassified", null, "business", "user"], ["personal", "pattern_learning", "business", "pattern_learning"], ["business", "user", "unclassified", null]]) {
    const items = planDriver([
      trip("K", 1, a, { distanceMiles: miles(40), ...cls(kc, ks) }),
      trip("X", 2, copyOf(a, "x"), { distanceMiles: miles(40), ...cls(xc, xs) }),
    ]);
    assert.equal(items[0].action, "REVIEW", `${kc} vs ${xc}`);
    assert.match(items[0].reason, /business/);
  }
});

test("a keeper in a month a manager approved is not changed to carry a classification", () => {
  const a = run(0, 40);
  const items = planDriver([
    trip("K", 1, a, { distanceMiles: miles(40), monthLocked: true, ...cls("unclassified", null) }),
    trip("X", 2, copyOf(a, "x"), { distanceMiles: miles(40), ...cls("personal", "user") }),
  ]);
  assert.equal(items[0].action, "REVIEW");
  assert.match(items[0].reason, /approved/);
});

test("a sparse keeper does not stand in for dense driving (path comparison)", () => {
  const keeperFixes = run(0, 120).filter((f) => (f.t - T0) % 20000 === 0);
  // every other fix wanders 200 m sideways: more miles than the keeper's straight line
  const copy = copyOf(run(0, 120), "x").map((f, i) => (i % 2 ? { ...f, lng: f.lng + 0.003 } : f));
  const items = planDriver([
    trip("K", 1, keeperFixes, { distanceMiles: miles(120) }),
    trip("X", 2, copy, { distanceMiles: miles(240) }),
  ]);
  assert.equal(items[0].action, "REVIEW");
  assert.match(items[0].reason, /record/);
});

test("timing-only coverage outnumbering exact-shared fixes 2:1 is held for review", () => {
  const keeperFixes = run(0, 120).filter((f) => ((f.t - T0) / 10000) % 12 === 0); // 11 fixes
  const items = planDriver([
    trip("K", 1, keeperFixes, { distanceMiles: miles(120) }),
    trip("X", 2, copyOf(run(0, 120), "x"), { distanceMiles: miles(120) }),
  ]);
  assert.equal(items[0].action, "REVIEW");
  assert.match(items[0].reason, /timing/);
});

test("a stretch under 5 fixes is held for review even when it is long", () => {
  const core = run(0, 30);
  const far = [1, 2, 3].map((k) => ({ ...fix(30 + k), lat: fix(30).lat + k * 0.004 })); // ~0.28 mi apart
  const items = planDriver([
    trip("K", 1, core, { distanceMiles: miles(30) }),
    trip("X", 2, copyOf([...core, ...far], "x"), { distanceMiles: miles(30) + 0.9 }),
  ]);
  assert.equal(items[0].action, "REVIEW");
  assert.match(items[0].reason, /only 3 fixes/);
});

test("anchor-shaped fixes are dropped from the kept route unless they lead the stretch; distance equals the kept path", () => {
  const core = run(0, 30);
  const anchorMid = { id: "anMid", t: T0 + 36 * 10000 + 500, lat: fix(36).lat, lng: -1, speed: 0, accuracy: 50 };
  const lead = { id: "anLead", t: T0 + 30 * 10000 + 5000, lat: fix(30).lat + 0.0001, lng: -1, speed: 0, accuracy: 50 };
  const stretch = run(31, 70);
  const X = copyOf([...core, lead, ...stretch.slice(0, 6), anchorMid, ...stretch.slice(6)], "x");
  const items = planDriver([trip("K", 1, core, { distanceMiles: miles(30) }), trip("X", 2, X, { distanceMiles: miles(70) })]);
  const it = items[0];
  assert.equal(it.action, "TRIM");
  assert.ok(!it.keepFixes.some((f) => f.t === anchorMid.t), "interior anchor-shaped fix dropped");
  assert.ok(it.keepFixes.some((f) => f.t === lead.t), "leading anchor within 60 s kept");
  const sorted = [...it.keepFixes].sort((a, b) => a.t - b.t);
  let path = 0;
  for (let i = 1; i < sorted.length; i++) path += Math.hypot(sorted[i].lat - sorted[i - 1].lat, sorted[i].lng - sorted[i - 1].lng) * 69;
  assert.ok(Math.abs(it.newMiles - path) < 0.1, `${it.newMiles} vs ${path}`);
});

test("miles that travelled through anchor-shaped fixes are not silently removed (balance)", () => {
  const core = run(0, 5); // 6 shared fixes
  // 100 anchor-shaped fixes (acc 50, speed 0) carry ~4 miles of real travel
  const through = Array.from({ length: 100 }, (_, i) => ({ id: `an${i}`, t: T0 + 50000 + (i + 1) * 10000, lat: fix(5).lat + (i + 1) * 0.0007, lng: -1, speed: 0, accuracy: 50 }));
  const items = planDriver([
    trip("K", 1, core, { distanceMiles: miles(5) }),
    trip("X", 2, copyOf([...core, ...through], "x"), { distanceMiles: miles(5) + 4.8 }),
  ]);
  assert.equal(items[0].action, "REVIEW");
  assert.match(items[0].reason, /removes/);
});

test("a held-back trip stays a full keeper for the copies that depend on it", () => {
  const a = run(0, 30);
  const b = copyOf([...a.slice(10), ...run(31, 60)], "b"); // would be a TRIM, but it has a shift
  const c = copyOf(run(40, 60), "c");
  const items = planDriver([
    trip("A", 1, a, { distanceMiles: miles(30) }),
    trip("B", 2, b, { distanceMiles: miles(50), reviewReasons: ["has a shift"] }),
    trip("C", 3, c, { distanceMiles: miles(20) }),
  ]);
  const byId = Object.fromEntries(items.map((i) => [i.tripId, i]));
  assert.equal(byId.B.action, "REVIEW");
  assert.equal(byId.C.action, "ARCHIVE");
  assert.deepEqual(byId.C.keeperIds, ["B"]); // B's own 31..60, not a trimmed form
});

test("a trip with more than 6000 coordinate rows is held back", () => {
  const a = run(0, 6000);
  const items = planDriver([trip("K", 1, a, { distanceMiles: miles(6000) }), trip("X", 2, copyOf(a, "x"), { distanceMiles: miles(6000) })]);
  assert.equal(items[0].action, "REVIEW");
  assert.match(items[0].reason, /6001 coordinate rows/);
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
  assert.equal(rowReviewReasons({ classificationSource: "user" }).length, 0); // carried to the keeper instead
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
