// Tiny SVG kit for MileClear tutorial mockups (390 x 844, dark theme).
export const W = 390, H = 844;
export const C = {
  bg: "#030712", surface: "#0a1120", border: "rgba(255,255,255,0.06)", hair: "rgba(255,255,255,0.08)",
  amber: "#f5a623", amberDim: "rgba(245,166,35,0.12)", amberGlow: "rgba(245,166,35,0.35)",
  t1: "#f0f2f5", t2: "#8494a7", t3: "#94a3b8", green: "#10b981", greenDim: "rgba(16,185,129,0.12)",
  red: "#ef4444", redDim: "rgba(239,68,68,0.12)", live: "#34c759", personal: "#374151", track: "#191f2d",
  heroTint: "#181a20", scrim: "rgba(3,7,18,0.78)",
};
const F = "Plus Jakarta Sans, -apple-system, Helvetica, Arial, sans-serif";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function t(x, y, s, o = {}) {
  const { size = 15, w = 400, fill = C.t1, anchor = "start", ls = 0, op } = o;
  return `<text x="${x}" y="${y}" font-family="${F}" font-size="${size}" font-weight="${w}" fill="${fill}" text-anchor="${anchor}"${ls ? ` letter-spacing="${ls}"` : ""}${op ? ` opacity="${op}"` : ""}>${esc(s)}</text>`;
}
// multi-line: lines array, line height lh
export function tl(x, y, lines, o = {}) {
  const lh = o.lh || Math.round((o.size || 15) * 1.4);
  return lines.map((l, i) => t(x, y + i * lh, l, o)).join("\n");
}
// rich line: segments [[text, {w, fill}]]
export function tr(x, y, segs, o = {}) {
  const { size = 15, anchor = "start" } = o;
  return `<text x="${x}" y="${y}" font-family="${F}" font-size="${size}" text-anchor="${anchor}">${segs
    .map(([s, so = {}]) => `<tspan font-weight="${so.w || 400}" fill="${so.fill || C.t1}">${esc(s)}</tspan>`)
    .join("")}</text>`;
}
export function r(x, y, w, h, o = {}) {
  const { rx = 0, fill = "none", stroke, sw = 1, dash, op } = o;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : ""}${dash ? ` stroke-dasharray="${dash}"` : ""}${op ? ` opacity="${op}"` : ""}/>`;
}
export const circ = (cx, cy, rr, fill, o = {}) =>
  `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="${fill}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 1}"` : ""}${o.op ? ` opacity="${o.op}"` : ""}/>`;
export const path = (d, o = {}) =>
  `<path d="${d}" fill="${o.fill || "none"}" stroke="${o.stroke || C.t1}" stroke-width="${o.sw || 1.8}" stroke-linecap="round" stroke-linejoin="round"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}/>`;
export const line = (x1, y1, x2, y2, stroke = C.hair, sw = 1) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}"/>`;

export function chevron(x, y, fill = C.t2) { return path(`M${x - 3} ${y - 6} L${x + 3} ${y} L${x - 3} ${y + 6}`, { stroke: fill, sw: 2 }); }
export function tick(cx, cy, rr = 11, fill = C.green) {
  return circ(cx, cy, rr, fill) + path(`M${cx - 5} ${cy} L${cx - 1.5} ${cy + 3.5} L${cx + 5} ${cy - 4}`, { stroke: "#04140d", sw: 2.4 });
}
export function bang(cx, cy, rr = 11, fill = C.red) {
  return circ(cx, cy, rr, fill) + r(cx - 1.4, cy - 6, 2.8, 7, { rx: 1.4, fill: "#fff" }) + circ(cx, cy + 4.5, 1.6, "#fff");
}
export function emptyDot(cx, cy, rr = 11, stroke = C.t3) { return circ(cx, cy, rr, "none", { stroke, sw: 1.6 }); }
export const arrowIcon = (x, y, s = 1, stroke = C.t1) =>
  path(`M${x} ${y + 8 * s} L${x + 16 * s} ${y} L${x + 9 * s} ${y + 16 * s} L${x + 7 * s} ${y + 9 * s} Z`, { stroke, sw: 2, fill: "none" });

export function statusBar() {
  return [
    t(46, 34, "9:41", { size: 16, w: 600 }),
    r(133, 10, 124, 34, { rx: 17, fill: "#000" }),
    r(292, 24, 3, 4, { rx: 1, fill: C.t1 }), r(297, 22, 3, 6, { rx: 1, fill: C.t1 }),
    r(302, 20, 3, 8, { rx: 1, fill: C.t1 }), r(307, 18, 3, 10, { rx: 1, fill: C.t1 }),
    r(318, 18, 24, 11, { rx: 3.5, stroke: C.t1 }), r(320, 20, 18, 7, { rx: 2, fill: C.t1 }),
  ].join("\n");
}
export function header({ mode = "Work", showPill = true } = {}) {
  const out = [
    r(16, 62, 30, 30, { rx: 8, fill: "#1b1714", stroke: C.amberGlow }),
    t(31, 83, "M", { size: 18, w: 800, fill: C.amber, anchor: "middle" }),
    tr(54, 84, [["Mile", { w: 700 }], ["Clear", { w: 700, fill: C.amber }]], { size: 21 }),
  ];
  if (showPill) {
    out.push(r(186, 62, 140, 30, { rx: 15, fill: C.surface, stroke: C.border }));
    const wx = mode === "Work" ? 189 : 255;
    out.push(r(wx, 65, 68, 24, { rx: 12, fill: C.personal, stroke: C.t3, sw: 1 }));
    out.push(t(223, 82, "Work", { size: 13, w: mode === "Work" ? 600 : 400, fill: mode === "Work" ? C.t1 : C.t2, anchor: "middle" }));
    out.push(t(289, 82, "Personal", { size: 13, w: mode === "Personal" ? 600 : 400, fill: mode === "Personal" ? C.t1 : C.t2, anchor: "middle" }));
  }
  out.push(circ(356, 77, 17, "#7c3aed", { stroke: C.border }));
  out.push(path("M346 80 h20 l-3 -6 h-12 z", { stroke: "#1b0f2e", sw: 1.6 }));
  return out.join("\n");
}
// tabs: array of names; active name
export function tabBar(tabs = ["Home", "Trips", "Tax", "Insights", "More"], active = "Home") {
  const y0 = H - 83;
  const out = [r(0, y0, W, 83, { fill: C.bg }), line(0, y0, W, y0, C.hair)];
  const n = tabs.length, cw = W / n;
  tabs.forEach((name, i) => {
    const cx = cw * i + cw / 2, on = name === active, col = on ? C.amber : C.t2;
    out.push(tabIcon(name, cx, y0 + 20, col));
    out.push(t(cx, y0 + 46, name, { size: 11, w: on ? 600 : 500, fill: col, anchor: "middle" }));
  });
  out.push(r(W / 2 - 67, H - 9, 134, 5, { rx: 2.5, fill: C.t1 }));
  return out.join("\n");
}
export function tabIcon(name, cx, cy, col) {
  switch (name) {
    case "Home": return path(`M${cx - 10} ${cy} L${cx} ${cy - 9} L${cx + 10} ${cy} M${cx - 7} ${cy - 2} V${cy + 10} H${cx + 7} V${cy - 2}`, { stroke: col });
    case "Trips": return r(cx - 10, cy - 5, 20, 11, { rx: 3, stroke: col, sw: 1.8 }) + path(`M${cx - 7} ${cy - 5} L${cx - 4} ${cy - 10} H${cx + 4} L${cx + 7} ${cy - 5}`, { stroke: col }) + circ(cx - 5, cy + 1, 1.6, col) + circ(cx + 5, cy + 1, 1.6, col);
    case "Tax": return path(`M${cx - 7} ${cy - 10} H${cx + 3} L${cx + 8} ${cy - 5} V${cy + 10} H${cx - 7} Z M${cx - 3} ${cy} H${cx + 4} M${cx - 3} ${cy + 4} H${cx + 4}`, { stroke: col });
    case "Insights": return path(`M${cx - 8} ${cy + 9} V${cy + 2} M${cx - 3} ${cy + 9} V${cy - 6} M${cx + 2} ${cy + 9} V${cy - 2} M${cx + 7} ${cy + 9} V${cy - 9}`, { stroke: col, sw: 2.2 });
    default: return circ(cx, cy, 10, "none", { stroke: col, sw: 1.8 }) + circ(cx - 4, cy, 1.4, col) + circ(cx, cy, 1.4, col) + circ(cx + 4, cy, 1.4, col);
  }
}
export function button(x, y, w, h, label, o = {}) {
  const { variant = "primary", size = 16, icon } = o;
  const fill = variant === "primary" ? C.amber : variant === "secondary" ? C.surface : "none";
  const stroke = variant === "secondary" ? "rgba(255,255,255,0.12)" : undefined;
  const col = variant === "primary" ? "#1a1204" : variant === "ghost" ? C.t2 : C.t1;
  return r(x, y, w, h, { rx: 14, fill, stroke }) + t(x + w / 2 + (icon ? 10 : 0), y + h / 2 + size * 0.35, label, { size, w: variant === "ghost" ? 500 : 700, fill: col, anchor: "middle" }) +
    (icon === "arrow" ? arrowIcon(x + w / 2 - label.length * size * 0.29 - 14, y + h / 2 - 8, 1, col) : "");
}
export function statusLine(y, kind, text, o = {}) {
  const out = [];
  if (kind === "red") {
    out.push(r(16, y, W - 32, 48, { rx: 12, fill: C.redDim, stroke: "rgba(239,68,68,0.35)" }));
    out.push(bang(38, y + 24, 9));
    out.push(t(56, y + 29, text, { size: 15, w: 600 }));
    out.push(t(W - 50, y + 29, "Fix", { size: 15, w: 700, fill: C.red, anchor: "end" }));
    out.push(chevron(W - 34, y + 24));
  } else if (kind === "amber") {
    out.push(r(16, y, W - 32, 48, { rx: 12, fill: C.amberDim, stroke: C.amberGlow }));
    out.push(circ(36, y + 24, 5, C.amber));
    out.push(t(52, y + 29, text, { size: 15, w: 600 }));
    out.push(chevron(W - 34, y + 24));
  } else {
    out.push(circ(24, y + 24, 5, kind === "grey" ? C.t3 : C.green));
    out.push(t(40, y + 29, text, { size: 15, w: 500 }));
    out.push(chevron(W - 28, y + 24));
    out.push(line(16, y + 48, W - 16, y + 48));
  }
  return out.join("\n");
}
export function card(x, y, w, h, o = {}) { return r(x, y, w, h, { rx: o.rx ?? 16, fill: o.fill || C.surface, stroke: o.stroke || C.border, sw: o.sw || 1 }); }
export function progress(x, y, w, frac, o = {}) {
  return r(x, y, w, o.h || 6, { rx: 3, fill: C.track }) + r(x, y, Math.max(6, w * frac), o.h || 6, { rx: 3, fill: o.fill || C.amber });
}
export function dots(cx, y, n, active) {
  const gap = 14, x0 = cx - ((n - 1) * gap) / 2;
  return Array.from({ length: n }, (_, i) =>
    i === active ? r(x0 + i * gap - 9, y - 3, 18, 6, { rx: 3, fill: C.amber }) : circ(x0 + i * gap, y, 3, "#3a4252")).join("");
}
// mini route map thumbnail
export function miniMap(x, y, w, h, o = {}) {
  return r(x, y, w, h, { rx: 12, fill: C.track }) +
    path(`M${x + w * 0.18} ${y + h * 0.75} C ${x + w * 0.35} ${y + h * 0.3}, ${x + w * 0.6} ${y + h * 0.85}, ${x + w * 0.82} ${y + h * 0.25}`, { stroke: C.amber, sw: 3 }) +
    circ(x + w * 0.18, y + h * 0.75, 4, C.amber) + circ(x + w * 0.82, y + h * 0.25, 4, C.bg, { stroke: C.t1, sw: 2 });
}
export function scrim(op = 0.78) { return r(0, 0, W, H, { fill: `rgba(3,7,18,${op})` }); }
// spotlight: dims everything except a rounded hole
export function spotlight(x, y, w, h, rx = 14, id = "sp") {
  return `<defs><mask id="${id}"><rect width="${W}" height="${H}" fill="#fff"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="#000"/></mask></defs>
<rect width="${W}" height="${H}" fill="rgba(3,7,18,0.80)" mask="url(#${id})"/>
<rect x="${x - 3}" y="${y - 3}" width="${w + 6}" height="${h + 6}" rx="${rx + 3}" fill="none" stroke="${C.amber}" stroke-width="2"/>`;
}
export function svg(body, note) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${note ? `<!-- ${note} -->\n` : ""}<rect width="${W}" height="${H}" fill="${C.bg}"/>
${body}
</svg>`;
}
export function sheet(y, h) {
  return r(0, y, W, h + 40, { rx: 22, fill: "#0d1526", stroke: "rgba(255,255,255,0.08)" }) + r(W / 2 - 18, y + 8, 36, 5, { rx: 2.5, fill: "#3a4252" });
}
