import { writeFileSync } from "node:fs";
import { W, H, C, t, tl, tr, r, circ, path, line, chevron, tick, bang, emptyDot, statusBar, header, tabBar, button, statusLine, card, progress, dots, miniMap, svg, sheet, arrowIcon } from "./lib.mjs";
const OUT = process.argv[2];
const save = (n, body, note) => writeFileSync(`${OUT}/${n}.svg`, svg(body, note));

// Shared chrome for the first-run steps: step dots, Back, Skip
function stepTop(step, total, { back = true, skip = "Skip" } = {}) {
  return [
    statusBar(),
    back ? path("M30 72 L22 80 L30 88", { stroke: C.t1, sw: 2.2 }) : "",
    dots(W / 2, 80, total, step),
    skip ? t(W - 20, 85, skip, { size: 15, w: 500, fill: C.t2, anchor: "end" }) : "",
  ].join("\n");
}

// ---------- A1: how it works ----------
{
  const b = [stepTop(0, 5, { back: false })];
  // illustration: road with car and route, start + stop chips
  b.push(card(20, 112, W - 40, 250, { rx: 24, fill: "#0b1222" }));
  b.push(path("M60 320 C 120 250, 150 300, 200 230 S 290 170, 330 150", { stroke: "#2a3346", sw: 22 }));
  b.push(path("M60 320 C 120 250, 150 300, 200 230 S 290 170, 330 150", { stroke: C.amber, sw: 4 }));
  b.push(circ(60, 320, 7, C.amber));
  b.push(circ(330, 150, 8, C.bg, { stroke: C.t1, sw: 2.5 }));
  b.push(r(44, 132, 132, 30, { rx: 15, fill: C.amberDim, stroke: C.amberGlow }));
  b.push(t(110, 152, "Starts at 15 mph", { size: 13, w: 600, fill: C.amber, anchor: "middle" }));
  b.push(r(232, 300, 132, 30, { rx: 15, fill: C.surface, stroke: "rgba(255,255,255,0.12)" }));
  b.push(t(298, 320, "Stops when parked", { size: 13, w: 600, anchor: "middle" }));
  b.push(t(24, 412, "MileClear records your", { size: 28, w: 700 }));
  b.push(t(24, 446, "drives by itself", { size: 28, w: 700 }));
  b.push(tl(24, 484, ["You don't need to open the app or press", "anything. Drive as normal and each trip", "appears on Home when you stop."], { size: 16, fill: C.t3, lh: 24 }));
  const rows = [["Leave your phone in your pocket or cradle", "It works with the app closed."], ["A stop of 4 minutes or more ends a trip", "A shop stop gives you two trips. Nothing is lost."], ["You sort each trip", "Business or Personal, one tap."]];
  rows.forEach(([a, s], i) => {
    const y = 576 + i * 56;
    b.push(tick(36, y + 2, 10, C.green));
    b.push(t(58, y, a, { size: 15, w: 600 }));
    b.push(t(58, y + 20, s, { size: 13, fill: C.t3 }));
  });
  b.push(button(20, 752, W - 40, 56, "Next"));
  save("a-1-how-it-works", b.join("\n"), "Direction A step 1 of 5: how automatic recording works");
}

// ---------- A2: location Always ----------
{
  const b = [stepTop(2, 5)];
  b.push(circ(W / 2, 168, 52, C.amberDim));
  b.push(path(`M${W / 2 - 18} ${170} L${W / 2 + 20} ${150} L${W / 2 + 4} ${190} L${W / 2 + 1} ${173} Z`, { stroke: C.amber, sw: 3 }));
  b.push(t(W / 2, 262, "One setting makes it work", { size: 25, w: 700, anchor: "middle" }));
  b.push(tl(W / 2, 296, ["To record drives while the app is closed,", "MileClear needs your location set to Always."], { size: 15, fill: C.t3, anchor: "middle", lh: 22 }));
  // mock of the iPhone choice
  b.push(card(28, 352, W - 56, 196, { rx: 18, fill: "#151d2e", stroke: "rgba(255,255,255,0.1)" }));
  b.push(t(W / 2, 384, "Your iPhone will ask twice", { size: 14, w: 600, fill: C.t2, anchor: "middle" }));
  b.push(t(48, 422, "1", { size: 15, w: 700, fill: C.amber }));
  b.push(t(70, 422, "First, tap", { size: 15, fill: C.t1 }));
  b.push(r(146, 404, 160, 26, { rx: 8, fill: "#24314a" }));
  b.push(t(226, 422, "Allow While Using", { size: 13, w: 600, fill: "#7ab8ff", anchor: "middle" }));
  b.push(line(48, 446, W - 48, 446, "rgba(255,255,255,0.08)"));
  b.push(t(48, 478, "2", { size: 15, w: 700, fill: C.amber }));
  b.push(t(70, 478, "Later, tap", { size: 15, fill: C.t1 }));
  b.push(r(146, 460, 172, 26, { rx: 8, fill: "#24314a" }));
  b.push(t(232, 478, "Change to Always Allow", { size: 13, w: 600, fill: "#7ab8ff", anchor: "middle" }));
  b.push(tl(70, 508, ["This one is what lets trips record", "with the app closed."], { size: 13, fill: C.t3, lh: 19 }));
  b.push(tr(28, 594, [["We only use your location to measure drives. ", { fill: C.t3 }]], { size: 13 }));
  b.push(tr(28, 614, [["We never sell it. ", { fill: C.t3 }], ["Read how we use it", { fill: C.amber, w: 600 }]], { size: 13 }));
  b.push(button(20, 680, W - 40, 56, "Allow location"));
  b.push(t(W / 2, 778, "I'd rather add trips myself", { size: 15, w: 500, fill: C.t2, anchor: "middle" }));
  save("a-3-location", b.join("\n"), "Direction A step 3: location primer before the iPhone prompts");
}

// ---------- A3: refused / While Using ----------
{
  const b = [stepTop(2, 5)];
  b.push(circ(W / 2, 168, 52, "rgba(148,163,184,0.10)"));
  b.push(path(`M${W / 2 - 18} 170 L${W / 2 + 20} 150 L${W / 2 + 4} 190 L${W / 2 + 1} 173 Z`, { stroke: C.t3, sw: 3 }));
  b.push(line(W / 2 - 26, 196, W / 2 + 26, 140, C.t3, 3));
  b.push(t(W / 2, 262, "Location is on While Using", { size: 24, w: 700, anchor: "middle" }));
  b.push(tl(W / 2, 296, ["MileClear can only record while the app is", "open on your screen. Most drives will be", "missed."], { size: 15, fill: C.t3, anchor: "middle", lh: 22 }));
  b.push(card(20, 378, W - 40, 150, { rx: 18 }));
  b.push(t(40, 410, "To change it", { size: 14, w: 700, fill: C.t2 }));
  ["Open Settings below", "Tap Location", "Choose Always"].forEach((s, i) => {
    b.push(circ(48, 440 + i * 28, 10, C.track));
    b.push(t(48, 445 + i * 28, String(i + 1), { size: 12, w: 700, fill: C.amber, anchor: "middle" }));
    b.push(t(68, 445 + i * 28, s, { size: 15 }));
  });
  b.push(button(20, 560, W - 40, 56, "Open Settings"));
  b.push(card(20, 640, W - 40, 112, { rx: 18, fill: "none", stroke: "rgba(255,255,255,0.10)" }));
  b.push(t(40, 670, "Prefer to add trips yourself?", { size: 15, w: 600 }));
  b.push(tl(40, 694, ["Use Start Trip before each drive, or add", "past trips by hand. You can switch later."], { size: 13, fill: C.t3, lh: 19 }));
  b.push(t(40, 740, "Use Start Trip only", { size: 15, w: 600, fill: C.t1 }));
  b.push(chevron(355, 735, C.t2));
  save("a-4-location-not-always", b.join("\n"), "Direction A step 3b: shown when the driver ends on While Using or Don't Allow");
}

// ---------- A4: live check ----------
{
  const b = [stepTop(3, 5)];
  b.push(t(24, 140, "Let's check it's working", { size: 26, w: 700 }));
  b.push(t(24, 170, "We test your phone now, not later.", { size: 15, fill: C.t3 }));
  b.push(card(20, 196, W - 40, 284, { rx: 18 }));
  const rows = [
    ["ok", "Location: Always", "Drives record with the app closed"],
    ["ok", "Motion and fitness", "Helps spot the start of a drive"],
    ["ok", "Background App Refresh", "Lets trips save while you drive"],
    ["todo", "Notifications", "So we can tell you a trip is saved"],
  ];
  rows.forEach(([s, a, d], i) => {
    const y = 236 + i * 66;
    if (s === "ok") b.push(tick(48, y, 12)); else b.push(emptyDot(48, y, 12, C.amber));
    b.push(t(72, y - 3, a, { size: 16, w: 600 }));
    b.push(t(72, y + 17, d, { size: 13, fill: C.t3 }));
    if (s === "todo") b.push(t(W - 40, y + 4, "Allow", { size: 15, w: 700, fill: C.amber, anchor: "end" }));
    if (i < 3) b.push(line(72, y + 33, W - 20, y + 33));
  });
  b.push(t(24, 520, "WHAT YOU'LL SEE ON HOME", { size: 12, w: 700, fill: C.t2, ls: 1.2 }));
  b.push(card(20, 534, W - 40, 60, { rx: 14 }));
  b.push(circ(42, 564, 5, C.green));
  b.push(t(58, 570, "Recording automatically", { size: 15, w: 500 }));
  b.push(chevron(W - 40, 564));
  b.push(tl(24, 620, ["This line at the top of Home is your check.", "Green: all good. Red: tap it and we'll fix it."], { size: 14, fill: C.t3, lh: 21 }));
  b.push(button(20, 752, W - 40, 56, "Next"));
  save("a-5-check", b.join("\n"), "Direction A step 4: live permission check and the Home status line");
}

// ---------- A5: your app, per driver type ----------
{
  const b = [stepTop(4, 5, { skip: "" })];
  b.push(t(24, 140, "Your app in four places", { size: 26, w: 700 }));
  b.push(t(24, 170, "Set up for: deliveries and gig work", { size: 15, fill: C.t3 }));
  const tabs = [
    ["Home", "Is it recording, your claim, your last trip"],
    ["Trips", "Every drive. Tap Business or Personal"],
    ["Tax", "Your mileage claim at 55p a mile"],
    ["More", "Your car, Settings, Help and the tour"],
  ];
  b.push(card(20, 196, W - 40, 4 * 76, { rx: 18 }));
  tabs.forEach(([n, d], i) => {
    const y = 196 + i * 76;
    b.push(r(36, y + 18, 40, 40, { rx: 12, fill: C.track }));
    b.push(`<g>${(await_icon(n, 56, y + 38))}</g>`);
    b.push(t(92, y + 34, n, { size: 16, w: 700 }));
    b.push(t(92, y + 55, d, { size: 13, fill: C.t3 }));
    if (i < 3) b.push(line(92, y + 76, W - 20, y + 76));
  });
  b.push(card(20, 524, W - 40, 128, { rx: 18, fill: C.amberDim, stroke: C.amberGlow }));
  b.push(t(40, 556, "Your first job", { size: 15, w: 700, fill: C.amber }));
  b.push(tl(40, 582, ["Go for a drive. When you stop, open", "MileClear and tap Business or Personal", "on your trip. That's it."], { size: 15, lh: 22 }));
  b.push(button(20, 712, W - 40, 56, "Go to Home"));
  b.push(t(W / 2, 800, "Replay any time: More > Help > Take the tour", { size: 13, fill: C.t2, anchor: "middle" }));
  save("a-6-your-app", b.join("\n"), "Direction A step 5: the tabs, worded for the driver's answer to You drive for");
}
function await_icon(n, cx, cy) {
  // reuse tab icons from lib via dynamic import is awkward; draw inline
  const col = C.amber;
  switch (n) {
    case "Home": return path(`M${cx - 10} ${cy} L${cx} ${cy - 9} L${cx + 10} ${cy} M${cx - 7} ${cy - 2} V${cy + 10} H${cx + 7} V${cy - 2}`, { stroke: col });
    case "Trips": return r(cx - 10, cy - 5, 20, 11, { rx: 3, stroke: col, sw: 1.8 }) + path(`M${cx - 7} ${cy - 5} L${cx - 4} ${cy - 10} H${cx + 4} L${cx + 7} ${cy - 5}`, { stroke: col });
    case "Tax": return path(`M${cx - 7} ${cy - 10} H${cx + 3} L${cx + 8} ${cy - 5} V${cy + 10} H${cx - 7} Z M${cx - 3} ${cy} H${cx + 4} M${cx - 3} ${cy + 4} H${cx + 4}`, { stroke: col });
    default: return circ(cx, cy, 10, "none", { stroke: col, sw: 1.8 }) + circ(cx - 4, cy, 1.4, col) + circ(cx, cy, 1.4, col) + circ(cx + 4, cy, 1.4, col);
  }
}

// ---------- A6: Home after the tour (new driver) ----------
{
  const b = [statusBar(), header({ mode: "Work" })];
  b.push(statusLine(110, "green", "Recording automatically"));
  b.push(card(16, 176, W - 32, 150, { rx: 18 }));
  b.push(r(32, 196, 44, 44, { rx: 22, fill: C.track }));
  b.push(arrowIcon(46, 210, 1, C.amber));
  b.push(t(90, 214, "Your first trip", { size: 17, w: 700 }));
  b.push(tl(90, 238, ["Just drive. It appears here when", "you stop."], { size: 14, fill: C.t3, lh: 20 }));
  b.push(line(16, 276, W - 16, 276));
  b.push(t(32, 306, "Add a past trip", { size: 14, w: 600, fill: C.amber }));
  b.push(t(W - 32, 306, "How it works", { size: 14, w: 600, fill: C.amber, anchor: "end" }));
  b.push(button(16, 344, W - 32, 56, "Start Trip"));
  b.push(tabBar(["Home", "Trips", "Tax", "More"], "Home"));
  save("a-7-home-after", b.join("\n"), "Direction A: Home straight after the tour, gig driver, location Always");
}

// ---------- A2: You drive for ----------
{
  const b = [stepTop(1, 5)];
  b.push(t(24, 140, "What do you drive for?", { size: 26, w: 700 }));
  b.push(tl(24, 170, ["We set up the app around your answer. You", "can change it later in Settings."], { size: 15, fill: C.t3, lh: 22 }));
  const opts = [
    ["Deliveries or gig work", "Uber, Deliveroo, Just Eat, Amazon Flex"],
    ["An employer, in my own car", "Care work, sales, site visits"],
    ["Gig work and an employer", "A bit of both"],
    ["A company car", "A mileage log for your employer"],
    ["Just me, not for work", "Everyday driving, no tax reminders"],
  ];
  opts.forEach(([a, d], i) => {
    const y = 216 + i * 74, sel = i === 0;
    b.push(r(20, y, W - 40, 64, { rx: 16, fill: sel ? C.amberDim : C.surface, stroke: sel ? C.amber : C.border, sw: sel ? 1.5 : 1 }));
    b.push(t(40, y + 28, a, { size: 16, w: 600 }));
    b.push(t(40, y + 48, d, { size: 13, fill: C.t3 }));
    b.push(circ(W - 46, y + 32, 10, sel ? C.amber : "none", { stroke: sel ? C.amber : C.t3, sw: 1.6 }));
    if (sel) b.push(circ(W - 46, y + 32, 4, "#1a1204"));
  });
  b.push(t(24, 614, "YOU DRIVE A", { size: 12, w: 700, fill: C.t2, ls: 1.2 }));
  b.push(r(20, 628, W - 40, 44, { rx: 22, fill: C.surface, stroke: C.border }));
  b.push(r(24, 632, (W - 48) / 2, 36, { rx: 18, fill: C.personal, stroke: C.t3 }));
  b.push(t(24 + (W - 48) / 4, 656, "Car or van", { size: 14, w: 600, anchor: "middle" }));
  b.push(t(24 + (3 * (W - 48)) / 4, 656, "Motorbike", { size: 14, fill: C.t2, anchor: "middle" }));
  b.push(button(20, 752, W - 40, 56, "Next"));
  save("a-2-you-drive-for", b.join("\n"), "Direction A step 2 of 5: You drive for (the question no new driver is asked today)");
}

// ---------- A8: existing drivers, What's new (one sheet) ----------
{
  const b = [statusBar(), header({ mode: "Work" })];
  b.push(statusLine(110, "green", "Recording automatically"));
  b.push(card(16, 172, W - 32, 128, { rx: 18, fill: C.heroTint, stroke: C.amberGlow }));
  b.push(t(36, 202, "Mileage claim · 2026-27", { size: 14, fill: C.t2 }));
  b.push(t(36, 248, "£1,384.35", { size: 40, w: 700 }));
  b.push(t(36, 280, "182 business miles this week", { size: 14 }));
  b.push(r(0, 0, W, H, { fill: "rgba(3,7,18,0.72)" }));
  b.push(sheet(330, H - 330));
  b.push(t(24, 378, "WHAT'S NEW", { size: 12, w: 700, fill: C.amber, ls: 1.2 }));
  b.push(t(24, 410, "MileClear has a simpler look", { size: 22, w: 700 }));
  const items = [
    ["The line at the top of Home", "Green means recording. Red means tap to fix."],
    ["Sort trips on Home", "Your last trip has Business and Personal."],
    ["Settings starts with a check-up", "Four ticks that say if anything needs you."],
  ];
  items.forEach(([a, d], i) => {
    const y = 456 + i * 62;
    b.push(tick(36, y + 2, 10));
    b.push(t(58, y + 6, a, { size: 15, w: 600 }));
    b.push(t(58, y + 26, d, { size: 13, fill: C.t3 }));
  });
  b.push(button(20, 660, W - 40, 56, "Got it"));
  b.push(t(W / 2, 752, "Take the full tour", { size: 15, w: 600, fill: C.t2, anchor: "middle" }));
  save("a-8-whats-new-existing", b.join("\n"), "Direction A, existing drivers: one What's new sheet on the first open after the update, never the full tour");
}
