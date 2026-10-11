import { writeFileSync } from "node:fs";
import { W, H, C, t, tl, tr, r, circ, path, line, chevron, tick, bang, statusBar, header, tabBar, button, statusLine, card, miniMap, svg, spotlight, arrowIcon } from "./lib.mjs";
const OUT = process.argv[2];
const save = (n, body, note) => writeFileSync(`${OUT}/${n}.svg`, svg(body, note));

// Coach mark bubble with pointer. pointer: "up" (bubble below target) or "down"
function bubble(x, y, w, title, lines, { step, total, pointerX, pointer = "up", primary = "Next" } = {}) {
  const h = 74 + lines.length * 21 + 44;
  const out = [r(x, y, w, h, { rx: 18, fill: "#f0f2f5" })];
  if (pointer === "up") out.push(`<path d="M${pointerX - 9} ${y} L${pointerX} ${y - 10} L${pointerX + 9} ${y} Z" fill="#f0f2f5"/>`);
  else out.push(`<path d="M${pointerX - 9} ${y + h} L${pointerX} ${y + h + 10} L${pointerX + 9} ${y + h} Z" fill="#f0f2f5"/>`);
  out.push(t(x + 18, y + 32, title, { size: 17, w: 700, fill: "#0a1120" }));
  out.push(tl(x + 18, y + 58, lines, { size: 14, fill: "#334155", lh: 21 }));
  const by = y + h - 30;
  if (step) out.push(t(x + 18, by + 5, `${step} of ${total}`, { size: 13, w: 600, fill: "#64748b" }));
  out.push(t(x + w - 112, by + 5, "Skip", { size: 14, w: 600, fill: "#475569", anchor: "end" }));
  out.push(r(x + w - 98, by - 16, 82, 34, { rx: 17, fill: "#0a1120" }));
  out.push(t(x + w - 57, by + 6, primary, { size: 14, w: 700, fill: "#f0f2f5", anchor: "middle" }));
  return out.join("\n");
}

// ---------- B1: Home first open, spotlight status line ----------
{
  const b = [statusBar(), header({ mode: "Work" })];
  b.push(statusLine(110, "green", "Recording automatically"));
  b.push(card(16, 176, W - 32, 130, { rx: 18 }));
  b.push(r(32, 196, 44, 44, { rx: 22, fill: C.track }));
  b.push(arrowIcon(46, 210, 1, C.amber));
  b.push(t(90, 214, "Your first trip", { size: 17, w: 700 }));
  b.push(tl(90, 238, ["Just drive. It appears here when", "you stop."], { size: 14, fill: C.t3, lh: 20 }));
  b.push(button(16, 326, W - 166, 56, "Start Trip"));
  b.push(r(W - 142, 326, 126, 56, { rx: 14, fill: C.surface, stroke: "rgba(255,255,255,0.12)" }));
  b.push(t(W - 79, 359, "Start Shift", { size: 15, w: 700, anchor: "middle" }));
  b.push(tabBar(["Home", "Trips", "Tax", "More"], "Home"));
  b.push(spotlight(10, 108, W - 20, 50, 12, "s1"));
  b.push(bubble(16, 176, W - 32, "Your recording check", ["Green means MileClear will record your", "next drive by itself. If this turns red,", "tap it and we'll show you the fix."], { step: 1, total: 3, pointerX: 60 }));
  save("b-1-home-status", b.join("\n"), "Direction B: first open of Home, coach mark 1 of 3 on the status line");
}

// ---------- B2: Home after first trip, spotlight last trip card ----------
{
  const b = [statusBar(), header({ mode: "Work" })];
  b.push(statusLine(110, "green", "Recording automatically"));
  b.push(card(16, 172, W - 32, 128, { rx: 18, fill: C.heroTint, stroke: C.amberGlow }));
  b.push(t(36, 202, "Mileage claim · 2026-27", { size: 14, fill: C.t2 }));
  b.push(t(36, 248, "£6.82", { size: 40, w: 700 }));
  b.push(t(36, 280, "12.4 business miles this week", { size: 14, fill: C.t1 }));
  b.push(button(16, 316, W - 166, 56, "Start Trip"));
  b.push(r(W - 142, 316, 126, 56, { rx: 14, fill: C.surface, stroke: "rgba(255,255,255,0.12)" }));
  b.push(t(W - 79, 349, "Start Shift", { size: 15, w: 700, anchor: "middle" }));
  b.push(card(16, 390, W - 32, 112, { rx: 18 }));
  b.push(miniMap(32, 406, 52, 52));
  b.push(t(98, 424, "Just now · 12.4 mi", { size: 15, w: 600 }));
  b.push(t(98, 446, "Home → Sunderland Depot", { size: 13, fill: C.t3 }));
  b.push(r(98, 462, 104, 30, { rx: 15, fill: C.amberDim, stroke: C.amber }));
  b.push(t(150, 482, "Business", { size: 13, w: 700, fill: C.amber, anchor: "middle" }));
  b.push(r(210, 462, 104, 30, { rx: 15, fill: C.surface, stroke: "rgba(255,255,255,0.14)" }));
  b.push(t(262, 482, "Personal", { size: 13, w: 600, anchor: "middle" }));
  b.push(tabBar(["Home", "Trips", "Tax", "More"], "Home"));
  b.push(spotlight(16, 390, W - 32, 112, 18, "s2"));
  b.push(bubble(16, 530, W - 32, "Your first trip is in", ["Tap Business if it was for work. Only", "Business trips count towards your", "mileage claim. You can change it later."], { step: 1, total: 2, pointerX: 150 }));
  save("b-2-home-first-trip", b.join("\n"), "Direction B: the first time a trip lands on Home, coach mark on the Business / Personal choice");
}

// ---------- B3: Trips tab first open, spotlight split trip pair ----------
{
  const b = [statusBar()];
  b.push(t(20, 92, "Trips", { size: 24, w: 600 }));
  b.push(circ(356, 84, 17, "#7c3aed"));
  b.push(card(16, 118, W - 32, 52, { rx: 14 }));
  b.push(t(36, 150, "Missing a trip you made?", { size: 15, fill: C.t2 }));
  b.push(chevron(W - 38, 144));
  ["All", "Inbox", "Business", "Personal"].forEach((n, i) => {
    const x = 16 + i * 90;
    b.push(r(x, 186, 84, 36, { rx: 18, fill: i === 0 ? C.amber : C.surface, stroke: i === 0 ? undefined : "rgba(255,255,255,0.1)" }));
    b.push(t(x + 42, 209, n, { size: 14, w: 600, fill: i === 0 ? "#1a1204" : C.t1, anchor: "middle" }));
  });
  b.push(t(20, 252, "TODAY", { size: 12, w: 700, fill: C.t2, ls: 1.2 }));
  const trips = [["17:52", "Tesco Hylton → Home", "2.1 mi"], ["17:31", "Home → Tesco Hylton", "1.9 mi"], ["12:08", "Depot → Doxford Park", "6.4 mi"]];
  trips.forEach(([tm, rt, mi], i) => {
    const y = 266 + i * 74;
    b.push(card(16, y, W - 32, 66, { rx: 14 }));
    b.push(t(32, y + 28, rt, { size: 15, w: 600 }));
    b.push(t(32, y + 50, `${tm} · ${mi}`, { size: 13, fill: C.t3 }));
    b.push(r(W - 118, y + 18, 86, 28, { rx: 14, fill: C.surface, stroke: C.amberGlow }));
    b.push(t(W - 75, y + 37, "Sort", { size: 13, w: 700, fill: C.amber, anchor: "middle" }));
  });
  b.push(tabBar(["Home", "Trips", "Tax", "More"], "Trips"));
  b.push(spotlight(16, 266, W - 32, 140, 14, "s3"));
  b.push(bubble(16, 432, W - 32, "A stop starts a new trip", ["Stop somewhere for 4 minutes or more", "and the next drive is a new trip, so a", "shop stop gives you two. Nothing is lost.", "To join them, open one, tap More, Merge."], { step: 2, total: 3, pointerX: 190 }));
  save("b-3-trips-split", b.join("\n"), "Direction B: first open of Trips, coach mark explaining why one outing can be two trips");
}

// ---------- B4: Tax first open ----------
{
  const b = [statusBar()];
  b.push(t(20, 92, "Tax", { size: 24, w: 600 }));
  b.push(circ(356, 84, 17, "#7c3aed"));
  b.push(card(16, 118, W - 32, 170, { rx: 20, fill: C.heroTint, stroke: C.amberGlow }));
  b.push(t(36, 150, "Mileage on your tax return · 2026-27", { size: 14, fill: C.t2 }));
  b.push(t(36, 200, "£6.82", { size: 44, w: 700 }));
  b.push(t(36, 232, "12.4 business miles at 55p a mile", { size: 14 }));
  b.push(t(36, 262, "How this is worked out", { size: 14, w: 600, fill: C.amber }));
  b.push(card(16, 304, W - 32, 112, { rx: 18 }));
  b.push(t(36, 336, "Your return for 2025-26", { size: 15, w: 600 }));
  b.push(t(36, 358, "Due 31 January · 112 days", { size: 13, fill: C.t3 }));
  b.push(t(36, 392, "Check what to put in each box", { size: 14, w: 600, fill: C.amber }));
  b.push(tabBar(["Home", "Trips", "Tax", "More"], "Tax"));
  b.push(spotlight(16, 118, W - 32, 170, 20, "s4"));
  b.push(bubble(16, 316, W - 32, "This is your claim", ["Every Business mile adds 55p, up to", "10,000 miles this tax year, then 25p.", "It goes on your Self Assessment. We", "don't send anything to HMRC for you."], { step: 1, total: 1, pointerX: 120, primary: "Got it" }));
  save("b-4-tax", b.join("\n"), "Direction B: first open of Tax, one coach mark (gig driver)");
}

// ---------- B5: Home, location not Always: coach mark replaced by a red status ----------
{
  const b = [statusBar(), header({ mode: "Personal" })];
  b.push(statusLine(110, "red", "Location is off. Not recording"));
  b.push(card(16, 176, W - 32, 130, { rx: 18 }));
  b.push(r(32, 196, 44, 44, { rx: 22, fill: C.track }));
  b.push(arrowIcon(46, 210, 1, C.t3));
  b.push(t(90, 214, "Your first trip", { size: 17, w: 700 }));
  b.push(tl(90, 238, ["Turn location on and your drives", "will start appearing here."], { size: 14, fill: C.t3, lh: 20 }));
  b.push(button(16, 326, W - 32, 56, "Start Trip"));
  b.push(tabBar(["Home", "Trips", "Insights", "More"], "Home"));
  b.push(spotlight(10, 108, W - 20, 50, 12, "s5"));
  b.push(bubble(16, 176, W - 32, "Your drives won't record yet", ["MileClear can't see your drives until", "location is set to Always. Tap Fix and", "we'll take you to the right switch. It", "takes about 20 seconds."], { pointerX: 330, primary: "Fix it" }));
  save("b-5-home-not-always", b.join("\n"), "Direction B: Home first open when location was refused (tier none); the only coach mark shown is the fix (Personal-only driver, Insights tab)");
}
