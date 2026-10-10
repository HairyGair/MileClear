import { writeFileSync } from "node:fs";
import { W, H, C, t, tl, tr, r, circ, path, line, chevron, tick, emptyDot, bang, statusBar, header, tabBar, button, statusLine, card, progress, miniMap, svg, sheet, arrowIcon, dots } from "./lib.mjs";
const OUT = process.argv[2];
const save = (n, body, note) => writeFileSync(`${OUT}/${n}.svg`, svg(body, note));

const ITEMS = [
  ["done", "Tell us what you drive for", "Deliveries or gig work"],
  ["done", "Set location to Always", "Drives record with the app closed"],
  ["next", "Go for a drive", "It records by itself at 15 mph"],
  ["todo", "Sort your first trip", "Business or Personal, one tap"],
  ["todo", "See your mileage claim", "On the Tax tab"],
  ["todo", "Add your car", "So the right rate is used"],
];

// ---------- C1: Home with Getting started card ----------
{
  const b = [statusBar(), header({ mode: "Work" })];
  b.push(statusLine(110, "green", "Recording automatically"));
  b.push(card(16, 172, W - 32, 392, { rx: 20 }));
  b.push(t(36, 206, "Getting started", { size: 19, w: 700 }));
  b.push(t(W - 36, 206, "2 of 6", { size: 14, w: 600, fill: C.t2, anchor: "end" }));
  b.push(progress(36, 222, W - 72, 2 / 6));
  ITEMS.forEach(([s, a, d], i) => {
    const y = 268 + i * 48;
    if (s === "done") b.push(tick(48, y - 4, 11));
    else b.push(emptyDot(48, y - 4, 11, s === "next" ? C.amber : "#475569"));
    b.push(t(70, y, a, { size: 15, w: s === "next" ? 700 : 500, fill: s === "done" ? C.t2 : C.t1 }));
    b.push(t(70, y + 18, d, { size: 12, fill: C.t3 }));
    if (s === "next") b.push(t(W - 36, y + 4, "Show me", { size: 14, w: 700, fill: C.amber, anchor: "end" }));
    else if (s === "todo") b.push(chevron(W - 40, y - 2));
  });
  b.push(button(16, 584, W - 32, 56, "Start Trip"));
  b.push(card(16, 656, W - 32, 52, { rx: 14 }));
  b.push(t(36, 688, "Where did you hear about MileClear?", { size: 14, fill: C.t1 }));
  b.push(path(`M${W - 42} 676 l10 10 m0 -10 l-10 10`, { stroke: C.t2, sw: 1.8 }));
  b.push(tabBar(["Home", "Trips", "Tax", "More"], "Home"));
  save("c-1-home-getting-started", b.join("\n"), "Direction C: Getting started card in the hero slot for a new gig driver (no trips yet, so no claim figure)");
}

// ---------- C2: Show me sheet for "Sort your first trip" ----------
{
  const b = [statusBar(), header({ mode: "Work" })];
  b.push(r(0, 0, W, H, { fill: "rgba(3,7,18,0.72)" }));
  b.push(sheet(250, H - 250));
  b.push(t(24, 296, "STEP 4 OF 6", { size: 12, w: 700, fill: C.t2, ls: 1.2 }));
  b.push(t(24, 328, "Sort your first trip", { size: 23, w: 700 }));
  b.push(tl(24, 358, ["Each trip is Business or Personal. Only", "Business trips count towards your claim."], { size: 15, fill: C.t3, lh: 22 }));
  // illustrated trip card
  b.push(card(24, 412, W - 48, 106, { rx: 16, fill: C.surface, stroke: "rgba(255,255,255,0.1)" }));
  b.push(miniMap(40, 428, 50, 50));
  b.push(t(104, 446, "Today 17:40 · 12.4 mi", { size: 15, w: 600 }));
  b.push(t(104, 467, "Home → Sunderland Depot", { size: 13, fill: C.t3 }));
  b.push(r(104, 480, 98, 28, { rx: 14, fill: C.amberDim, stroke: C.amber }));
  b.push(t(153, 499, "Business", { size: 13, w: 700, fill: C.amber, anchor: "middle" }));
  b.push(r(210, 480, 98, 28, { rx: 14, fill: C.surface, stroke: "rgba(255,255,255,0.14)" }));
  b.push(t(259, 499, "Personal", { size: 13, w: 600, anchor: "middle" }));
  const pts = [["Where", "Your last trip is on Home. All trips are on Trips."], ["Unsure?", "Driving to a regular workplace is usually Personal."], ["Changed your mind?", "Tap the trip and choose again."]];
  pts.forEach(([a, d], i) => {
    const y = 556 + i * 46;
    b.push(t(24, y, a, { size: 14, w: 700 }));
    b.push(t(24, y + 20, d, { size: 13, fill: C.t3 }));
  });
  b.push(button(20, 712, W - 40, 56, "Got it"));
  b.push(t(W / 2, 800, "Take me to my trips", { size: 15, w: 600, fill: C.t2, anchor: "middle" }));
  save("c-2-show-me-sort", b.join("\n"), "Direction C: the Show me sheet behind one checklist item");
}

// ---------- C3: Help with Take the tour ----------
{
  const b = [statusBar()];
  b.push(path("M30 72 L22 80 L30 88", { stroke: C.t1, sw: 2.2 }));
  b.push(t(W / 2, 86, "Help and how-tos", { size: 17, w: 600, anchor: "middle" }));
  b.push(card(16, 116, W - 32, 150, { rx: 20, fill: C.heroTint, stroke: C.amberGlow }));
  b.push(t(36, 150, "Take the tour", { size: 19, w: 700 }));
  b.push(tl(36, 176, ["Two minutes on how MileClear records,", "sorts and adds up your drives."], { size: 14, fill: C.t3, lh: 20 }));
  b.push(r(36, 214, 120, 36, { rx: 18, fill: C.amber }));
  b.push(t(96, 237, "Start tour", { size: 14, w: 700, fill: "#1a1204", anchor: "middle" }));
  b.push(t(170, 237, "Getting started: 2 of 6", { size: 13, w: 600, fill: C.t2 }));
  b.push(t(20, 304, "GETTING STARTED", { size: 12, w: 700, fill: C.t2, ls: 1.2 }));
  const qs = ["How does MileClear spot a drive?", "Why is one drive two trips?", "I missed a trip. What do I do?", "Start Trip or automatic trips?", "Work mode vs Personal mode?", "What does Pro add?"];
  b.push(card(16, 318, W - 32, qs.length * 52, { rx: 16 }));
  qs.forEach((q, i) => {
    const y = 318 + i * 52;
    b.push(t(36, y + 32, q, { size: 15 }));
    b.push(chevron(W - 38, y + 27));
    if (i < qs.length - 1) b.push(line(36, y + 52, W - 16, y + 52));
  });
  b.push(card(16, 652, W - 32, 64, { rx: 16 }));
  b.push(circ(46, 684, 14, C.track));
  b.push(t(46, 689, "?", { size: 15, w: 700, fill: C.amber, anchor: "middle" }));
  b.push(t(72, 680, "Ask EmSee", { size: 15, w: 600 }));
  b.push(t(72, 700, "Questions about the app, any time", { size: 13, fill: C.t3 }));
  b.push(chevron(W - 38, 684));
  save("c-3-help-take-the-tour", b.join("\n"), "Direction C (and the replay entry for all directions): Help opens with Take the tour and the checklist progress");
}

// ---------- C4: Checklist done, the card says goodbye ----------
{
  const b = [statusBar(), header({ mode: "Work" })];
  b.push(statusLine(110, "green", "Recording automatically"));
  b.push(card(16, 172, W - 32, 128, { rx: 18, fill: C.heroTint, stroke: C.amberGlow }));
  b.push(t(36, 202, "Mileage claim · 2026-27", { size: 14, fill: C.t2 }));
  b.push(t(36, 248, "£48.40", { size: 40, w: 700 }));
  b.push(t(36, 280, "88 business miles this week", { size: 14 }));
  b.push(card(16, 316, W - 32, 112, { rx: 18, fill: C.greenDim, stroke: "rgba(16,185,129,0.35)" }));
  b.push(tick(44, 350, 12));
  b.push(t(66, 356, "You're all set up", { size: 17, w: 700 }));
  b.push(tl(36, 386, ["6 of 6 done. This card goes away now.", "Help has the tour if you want it again."], { size: 14, fill: C.t3, lh: 20 }));
  b.push(button(16, 446, W - 166, 56, "Start Trip"));
  b.push(r(W - 142, 446, 126, 56, { rx: 14, fill: C.surface, stroke: "rgba(255,255,255,0.12)" }));
  b.push(t(W - 79, 479, "Start Shift", { size: 15, w: 700, anchor: "middle" }));
  b.push(card(16, 520, W - 32, 84, { rx: 18 }));
  b.push(miniMap(32, 536, 52, 52));
  b.push(t(98, 556, "Yesterday 17:40 · 12.4 mi · Business", { size: 14, w: 600 }));
  b.push(t(98, 578, "Home → Sunderland Depot", { size: 13, fill: C.t3 }));
  b.push(tabBar(["Home", "Trips", "Tax", "More"], "Home"));
  save("c-4-home-all-done", b.join("\n"), "Direction C: day 5, the checklist is done and shows once before it leaves");
}
