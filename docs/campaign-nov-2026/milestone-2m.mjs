// 2 million miles (27 Oct 2026). One-off milestone art in the "Count Every Mile"
// style: feed (1080x1350, Facebook + LinkedIn), story (1080x1920) and the
// blog post share image (1200x628, apps/web/public/og/updates/).
//   node docs/campaign-nov-2026/milestone-2m.mjs
// Figures: counted drives only (no phantom trips, no possible duplicates),
// read on prod 27 Oct ~09:15.

import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const HTML = join(ROOT, "html");
const OUT = join(ROOT, "output");
const OG = join(ROOT, "../../apps/web/public/og/updates/two-million-miles.png");
mkdirSync(HTML, { recursive: true });
mkdirSync(OUT, { recursive: true });

const STATS = [
  ["176,910", "journeys"],
  ["1,603", "drivers"],
  ["80", "times round the Earth"],
];

// Perspective road with a dashed centre line, amber and red light trails.
function road({ w, h, vx, vy, spread }) {
  const l = vx - spread, r = vx + spread;
  const dash = [[0.03, 0.07], [0.11, 0.17], [0.22, 0.31], [0.38, 0.52], [0.62, 0.84], [0.96, 1.25]]
    .map(([a, b]) => {
      const y = (t) => vy + (h - vy) * t, hw = (t) => 1.5 + 16 * t;
      return `<polygon points="${vx - hw(a)},${y(a)} ${vx + hw(a)},${y(a)} ${vx + hw(b)},${y(b)} ${vx - hw(b)},${y(b)}"/>`;
    })
    .join("");
  const trail = (x2, color, width, op) =>
    `<path d="M${vx} ${vy} Q ${(vx + x2) / 2} ${vy + (h - vy) * 0.45} ${x2} ${h + 40}" stroke="${color}" stroke-width="${width}" fill="none" opacity="${op}" filter="url(#glow)"/>`;
  return `<svg class="abs" style="left:0;top:0;z-index:2" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="tarmac" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1527"/><stop offset="1" stop-color="#050a16"/></linearGradient>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbbf24" stop-opacity="0"/><stop offset=".35" stop-color="#fbbf24" stop-opacity=".9"/><stop offset="1" stop-color="#f5a623"/></linearGradient>
      <radialGradient id="horizon" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fbbf24" stop-opacity=".55"/><stop offset="1" stop-color="#fbbf24" stop-opacity="0"/></radialGradient>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <ellipse cx="${vx}" cy="${vy}" rx="${spread * 1.3}" ry="${spread * 0.22}" fill="url(#horizon)"/>
    <polygon points="${vx - 6},${vy} ${vx + 6},${vy} ${r},${h} ${l},${h}" fill="url(#tarmac)"/>
    <line x1="${vx - 6}" y1="${vy}" x2="${l}" y2="${h}" stroke="#334155" stroke-width="3" opacity=".7"/>
    <line x1="${vx + 6}" y1="${vy}" x2="${r}" y2="${h}" stroke="#334155" stroke-width="3" opacity=".7"/>
    <g fill="url(#fade)">${dash}</g>
    ${trail(l + spread * 0.28, "#ef4444", 5, 0.75)}
    ${trail(l + spread * 0.42, "#f87171", 2.5, 0.5)}
    ${trail(r - spread * 0.3, "#fde68a", 5, 0.85)}
    ${trail(r - spread * 0.46, "#fbbf24", 2.5, 0.6)}
  </svg>`;
}

const brand = ({ left, top, center = false, scale = 1 }) => `<div class="brand" style="left:${left}px;top:${top}px;${center ? `right:${left}px;text-align:center;` : ""}transform:scale(${scale});transform-origin:${center ? "top center" : "top left"}">
  <div class="row" style="${center ? "justify-content:center" : ""}"><img class="icon" src="../assets/icon.svg"><div class="wordmark">Mile<span class="c">Clear</span></div></div>
  <div class="free">Free on <b>iPhone</b> and <b>Android</b></div>
  <div class="stores" style="${center ? "justify-content:center" : ""}"><img class="apple" src="../assets/badge.svg"><div class="play"><img src="../assets/play-badge.png"></div></div>
</div>`;

const stats = ({ left, top, width, size = 54, gap = 20 }) => `<div class="abs" style="z-index:10;left:${left}px;top:${top}px;width:${width}px;display:flex;gap:${gap}px">
  ${STATS.map(([n, l]) => `<div class="tile" style="position:relative;flex:1;padding:22px 24px">
    <div style="font-family:Sora;font-weight:800;font-size:${size}px;letter-spacing:-.04em;line-height:1" class="gold">${n}</div>
    <div class="body" style="font-size:${Math.round(size * 0.45)}px;margin-top:8px">${l}</div></div>`).join("")}
</div>`;

const page = (cls, w, h, inner, hx = "50%", hy = "40%") => `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="../campaign.css"></head>
<body><div class="stage ${cls}" style="width:${w}px;height:${h}px;--hx:${hx};--hy:${hy}">${inner}<div class="vignette"></div><div class="grain"></div></div></body></html>`;

const headline = (size) => `<div class="hl gold" style="font-size:${size}px">2,000,000</div>
  <div class="hl" style="font-size:${Math.round(size * 0.62)}px;margin-top:${Math.round(size * 0.02)}px">miles.</div>`;

const files = {
  "milestone-2m-feed": page("feed", 1080, 1350, `
    ${road({ w: 1080, h: 1350, vx: 700, vy: 880, spread: 700 })}
    <div class="abs" style="z-index:10;left:80px;top:84px"><div class="chip">${"Monday 26 October 2026"}</div></div>
    <div class="abs" style="z-index:10;left:76px;top:180px">${headline(170)}</div>
    <div class="abs sub" style="left:80px;top:490px;font-size:46px;color:#e2e8f0">Recorded by MileClear drivers.<br><span class="gold">Thank you.</span></div>
    ${stats({ left: 80, top: 650, width: 920 })}
    ${brand({ left: 80, top: 1110 })}
  `, "50%", "62%"),
  "milestone-2m-story": page("story", 1080, 1920, `
    ${road({ w: 1080, h: 1920, vx: 720, vy: 1200, spread: 820 })}
    <div class="abs" style="z-index:10;left:80px;top:270px"><div class="chip">Monday 26 October 2026</div></div>
    <div class="abs" style="z-index:10;left:76px;top:370px">${headline(170)}</div>
    <div class="abs sub" style="left:80px;top:680px;font-size:50px;color:#e2e8f0">Recorded by MileClear drivers.<br><span class="gold">Thank you.</span></div>
    ${stats({ left: 80, top: 900, width: 920 })}
    ${brand({ left: 80, top: 1500 })}
  `, "50%", "60%"),
  "milestone-2m-og": page("", 1200, 628, `
    ${road({ w: 1200, h: 628, vx: 930, vy: 300, spread: 420 })}
    <div class="abs" style="z-index:10;left:64px;top:56px"><div class="chip" style="height:40px;font-size:18px">26 October 2026</div></div>
    <div class="abs" style="z-index:10;left:60px;top:124px">${headline(132)}</div>
    <div class="abs sub" style="left:64px;top:356px;font-size:32px;color:#e2e8f0">Recorded by MileClear drivers.</div>
    ${stats({ left: 64, top: 430, width: 700, size: 38, gap: 14 })}
  `, "78%", "48%"),
};

const sizes = { "milestone-2m-feed": [1080, 1350], "milestone-2m-story": [1080, 1920], "milestone-2m-og": [1200, 628] };
for (const [name, html] of Object.entries(files)) writeFileSync(join(HTML, `${name}.html`), html);

const { chromium } = await import(pathToFileURL("/Users/anthony/Projects/ReadyPlayerOn/node_modules/playwright-core/index.mjs").href);
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--allow-file-access-from-files", "--font-render-hinting=none"],
});
for (const [name, [w, h]] of Object.entries(sizes)) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.goto(pathToFileURL(join(HTML, `${name}.html`)).href, { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(150);
  await p.screenshot({ path: join(OUT, `${name}.png`), clip: { x: 0, y: 0, width: w, height: h } });
  await p.close();
}
await browser.close();
copyFileSync(join(OUT, "milestone-2m-og.png"), OG);
console.log("done");
