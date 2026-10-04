// Ticket defender evidence pack (Pro, Oct 2026): a PDF record of what
// MileClear recorded around the time on a penalty notice.
//
// The track is drawn with PDFKit vector lines on a plain grid with a scale
// bar and a north arrow. No map tiles: tile licences do not cover putting
// them in a document the driver sends to a council.
//
// Wording rule: this is "a record of where MileClear recorded this phone".
// It never says it proves anything or that an appeal will succeed.

import PDFDocument from "pdfkit";
import crypto from "crypto";
import {
  chooseScaleBar,
  projectTrack,
  TICKET_NOTICE_TYPES,
  ukDate,
  ukTime,
  type TdPoint,
  type TicketDefenderLookup,
  type TicketNoticeType,
} from "@mileclear/shared";

const NAVY = "#030712";
const AMBER = "#f5a623";
const WHITE = "#ffffff";
const GREY_100 = "#f3f4f6";
const GREY_200 = "#e5e7eb";
const GREY_400 = "#9ca3af";
const GREY_600 = "#4b5563";
const GREEN = "#10b981";
const RED = "#dc2626";
const TRACK = "#1e3a8a";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 40;
const CONTENT_W = PAGE_W - M * 2;
const BOTTOM = PAGE_H - 60;

export interface NoticeDetails {
  type?: TicketNoticeType | null;
  reference?: string | null;
  issuer?: string | null;
}

export interface PackInput {
  lookup: TicketDefenderLookup;
  points: TdPoint[];
  driverName: string;
  notice: NoticeDetails;
  userId: string;
}

function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

export function packReference(userId: string, at: string): string {
  const hash = crypto.createHash("sha256").update(`${userId}:${at}:${Date.now()}`).digest("hex").slice(0, 6).toUpperCase();
  return `MC-TD-${hash}`;
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > BOTTOM) {
    doc.addPage();
    doc.y = M;
  }
}

function heading(doc: PDFKit.PDFDocument, text: string, keepWith = 40) {
  ensureSpace(doc, keepWith);
  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(GREY_600).text(text.toUpperCase(), M, doc.y, { characterSpacing: 1 });
  doc.moveDown(0.3);
}

function body(doc: PDFKit.PDFDocument, text: string, opts: { size?: number; color?: string; bold?: boolean } = {}) {
  ensureSpace(doc, 20);
  doc
    .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(opts.size ?? 10)
    .fillColor(opts.color ?? NAVY)
    .text(text, M, doc.y, { width: CONTENT_W, lineGap: 2 });
}

function drawHeader(doc: PDFKit.PDFDocument, subtitle: string, ref: string) {
  doc.rect(0, 0, PAGE_W, 64).fill(NAVY);
  doc.font("Helvetica-Bold").fontSize(18);
  doc.fillColor(WHITE).text("Mile", M, 14, { continued: true });
  doc.fillColor(AMBER).text("Clear", { continued: false });
  doc.fillColor(WHITE).fontSize(14).text("Journey record", M, 18, { width: CONTENT_W, align: "center" });
  doc.fillColor(GREY_400).font("Helvetica").fontSize(9).text(subtitle, M, 38, { width: CONTENT_W, align: "center" });
  doc.font("Helvetica").fontSize(7).fillColor(GREY_400).text(ref, M, 46, { width: CONTENT_W, align: "right" });
  doc.y = 84;
}

function labelValue(doc: PDFKit.PDFDocument, rows: [string, string][]) {
  for (const [label, value] of rows) {
    ensureSpace(doc, 16);
    const y = doc.y;
    doc.font("Helvetica").fontSize(9).fillColor(GREY_600).text(label, M, y, { width: 130 });
    doc.font("Helvetica").fontSize(10).fillColor(NAVY).text(value || "Not given", M + 135, y, { width: CONTENT_W - 135 });
    doc.y = Math.max(doc.y, y + 14);
  }
}

function fmtCoord(n: number): string {
  return n.toFixed(5);
}

// ── Track drawing ─────────────────────────────────────────────────────────

function drawTrack(doc: PDFKit.PDFDocument, input: PackInput) {
  const { lookup, points } = input;
  const boxH = 300;
  ensureSpace(doc, boxH + 60);
  const x0 = M;
  const y0 = doc.y;

  doc.rect(x0, y0, CONTENT_W, boxH).fillAndStroke(WHITE, GREY_200);

  // Fit the track, plus the notice location when it is near enough to share
  // the drawing (within 20 km of the track).
  const fit: { lat: number; lng: number }[] = points.map((p) => ({ lat: p.lat, lng: p.lng }));
  let locationOff: number | null = null;
  if (lookup.location) {
    const near = lookup.nearestToLocation?.distanceFromNoticeMetres ?? Infinity;
    if (fit.length === 0 || near <= 20_000) fit.push({ lat: lookup.location.lat, lng: lookup.location.lng });
    else locationOff = near;
  }
  const proj = projectTrack(fit, CONTENT_W, boxH, 28);
  if (!proj) {
    doc.font("Helvetica").fontSize(10).fillColor(GREY_600).text("No recorded points to draw for this time.", x0, y0 + boxH / 2 - 6, {
      width: CONTENT_W,
      align: "center",
    });
    doc.y = y0 + boxH + 10;
    return;
  }
  const at = (lat: number, lng: number) => {
    const { x, y } = proj.toXY(lat, lng);
    return { x: x0 + x, y: y0 + y };
  };

  // Grid at the scale-bar spacing.
  const scale = chooseScaleBar(proj.metresPerUnit * CONTENT_W * 0.25);
  const step = scale.metres / proj.metresPerUnit;
  doc.save();
  doc.rect(x0, y0, CONTENT_W, boxH).clip();
  doc.lineWidth(0.4).strokeColor(GREY_100);
  if (step > 6) {
    for (let x = x0 + step; x < x0 + CONTENT_W; x += step) doc.moveTo(x, y0).lineTo(x, y0 + boxH).stroke();
    for (let y = y0 + step; y < y0 + boxH; y += step) doc.moveTo(x0, y).lineTo(x0 + CONTENT_W, y).stroke();
  }

  // One line per trip; a break in the line wherever recording had a gap.
  const byTrip = new Map<string, TdPoint[]>();
  for (const p of points) {
    const list = byTrip.get(p.tripId) ?? [];
    list.push(p);
    byTrip.set(p.tripId, list);
  }
  doc.lineWidth(1.6).strokeColor(TRACK).lineJoin("round").lineCap("round");
  for (const list of byTrip.values()) {
    let drawing = false;
    for (let i = 0; i < list.length; i++) {
      const { x, y } = at(list[i].lat, list[i].lng);
      const gap = i > 0 && new Date(list[i].recordedAt).getTime() - new Date(list[i - 1].recordedAt).getTime() > 180_000;
      if (!drawing || gap) {
        if (drawing) doc.stroke();
        doc.moveTo(x, y);
        drawing = true;
      } else {
        doc.lineTo(x, y);
      }
    }
    if (drawing) doc.stroke();
    if (list.length === 1) {
      const { x, y } = at(list[0].lat, list[0].lng);
      doc.circle(x, y, 2).fill(TRACK);
    }
  }

  // Markers.
  const nt = lookup.nearestInTime;
  const nl = lookup.nearestToLocation;
  if (nl && lookup.location && (!nt || nl.recordedAt !== nt.recordedAt)) {
    const { x, y } = at(nl.lat, nl.lng);
    doc.circle(x, y, 5).lineWidth(1.5).fillAndStroke(WHITE, GREEN);
  }
  if (nt) {
    const { x, y } = at(nt.lat, nt.lng);
    doc.circle(x, y, 6).lineWidth(1.5).fillAndStroke(AMBER, NAVY);
  }
  if (lookup.location && locationOff == null) {
    const { x, y } = at(lookup.location.lat, lookup.location.lng);
    doc.lineWidth(2).strokeColor(RED);
    doc.moveTo(x - 6, y - 6).lineTo(x + 6, y + 6).stroke();
    doc.moveTo(x - 6, y + 6).lineTo(x + 6, y - 6).stroke();
  }
  doc.restore();

  // Scale bar, bottom left.
  const sbLen = scale.metres / proj.metresPerUnit;
  const sbX = x0 + 12;
  const sbY = y0 + boxH - 16;
  doc.lineWidth(1.5).strokeColor(NAVY);
  doc.moveTo(sbX, sbY).lineTo(sbX + sbLen, sbY).stroke();
  doc.moveTo(sbX, sbY - 4).lineTo(sbX, sbY + 1).stroke();
  doc.moveTo(sbX + sbLen, sbY - 4).lineTo(sbX + sbLen, sbY + 1).stroke();
  doc.font("Helvetica").fontSize(8).fillColor(NAVY).text(scale.label, sbX, sbY - 14, { lineBreak: false });

  // North arrow, top right.
  const nx = x0 + CONTENT_W - 22;
  const ny = y0 + 14;
  doc.moveTo(nx, ny).lineTo(nx - 6, ny + 18).lineTo(nx, ny + 13).lineTo(nx + 6, ny + 18).closePath().fill(NAVY);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(NAVY).text("N", nx - 3, ny + 21, { lineBreak: false });

  doc.y = y0 + boxH + 8;

  // Legend.
  const ly = doc.y;
  let lx = M;
  const legend = (draw: (x: number, y: number) => void, label: string) => {
    draw(lx + 5, ly + 5);
    doc.font("Helvetica").fontSize(8).fillColor(GREY_600).text(label, lx + 14, ly + 1, { lineBreak: false });
    lx += 14 + doc.widthOfString(label) + 16;
  };
  legend((x, y) => {
    doc.lineWidth(1.6).strokeColor(TRACK).moveTo(x - 5, y).lineTo(x + 5, y).stroke();
  }, "Recorded route");
  if (nt) legend((x, y) => doc.circle(x, y, 4).lineWidth(1).fillAndStroke(AMBER, NAVY), `Closest in time (${ukTime(nt.recordedAt)})`);
  if (nl && lookup.location && (!nt || nl.recordedAt !== nt.recordedAt)) {
    legend((x, y) => doc.circle(x, y, 4).lineWidth(1).fillAndStroke(WHITE, GREEN), `Closest to notice location (${ukTime(nl.recordedAt)})`);
  }
  if (lookup.location && locationOff == null) {
    legend((x, y) => {
      doc.lineWidth(1.5).strokeColor(RED);
      doc.moveTo(x - 4, y - 4).lineTo(x + 4, y + 4).stroke();
      doc.moveTo(x - 4, y + 4).lineTo(x + 4, y - 4).stroke();
    }, "Notice location");
  }
  doc.y = ly + 16;
  const note =
    `Drawn from the recorded GPS points on a plain grid; no map is shown. Each grid square is ${scale.label} across. ` +
    `Breaks in the line are gaps in recording of more than 3 minutes.` +
    (locationOff != null ? ` The notice location is ${(locationOff / 1609.344).toFixed(1)} miles from the nearest recorded point, too far to draw at this scale.` : "");
  body(doc, note, { size: 8, color: GREY_600 });
}

// ── Tables ────────────────────────────────────────────────────────────────

function table(doc: PDFKit.PDFDocument, cols: { label: string; width: number; align?: "left" | "right" }[], rows: string[][], highlight: Set<number> = new Set()) {
  const rowH = 15;
  const drawHead = () => {
    const y = doc.y;
    doc.rect(M, y, CONTENT_W, rowH).fill(NAVY);
    let x = M;
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(WHITE);
    for (const c of cols) {
      doc.text(c.label, x + 4, y + 4, { width: c.width - 8, align: c.align ?? "left", lineBreak: false });
      x += c.width;
    }
    doc.y = y + rowH;
  };
  ensureSpace(doc, rowH * 3);
  drawHead();
  rows.forEach((r, i) => {
    if (doc.y + rowH > BOTTOM) {
      doc.addPage();
      doc.y = M;
      drawHead();
    }
    const y = doc.y;
    if (highlight.has(i)) doc.rect(M, y, CONTENT_W, rowH).fill("#fef3c7");
    else if (i % 2 === 1) doc.rect(M, y, CONTENT_W, rowH).fill(GREY_100);
    let x = M;
    doc.font(highlight.has(i) ? "Helvetica-Bold" : "Helvetica").fontSize(7.5).fillColor(NAVY);
    r.forEach((cell, k) => {
      doc.text(cell, x + 4, y + 4, { width: cols[k].width - 8, align: cols[k].align ?? "left", lineBreak: false, ellipsis: true });
      x += cols[k].width;
    });
    doc.y = y + rowH;
  });
  doc.moveDown(0.4);
}

// ── Document ──────────────────────────────────────────────────────────────

export async function generateTicketDefenderPdf(input: PackInput): Promise<Buffer> {
  const { lookup, notice } = input;
  const ref = packReference(input.userId, lookup.at);
  const doc = new PDFDocument({ size: "A4", margin: M, bufferPages: true, info: { Title: "MileClear journey record", Author: "MileClear" } });
  const done = collect(doc);

  drawHeader(doc, `Around ${ukTime(lookup.at)} on ${ukDate(lookup.at)}`, ref);

  body(doc, "A record of where MileClear recorded this phone around a given time, made at the account holder's request.", {
    size: 9,
    color: GREY_600,
  });

  heading(doc, "Prepared for");
  labelValue(doc, [
    ["Name", input.driverName],
    ["Generated", `${ukDate(new Date())} at ${ukTime(new Date())} (UK time)`],
    ["Reference", ref],
  ]);

  heading(doc, "The notice (as entered by the driver)");
  const typeLabel = TICKET_NOTICE_TYPES.find((t) => t.value === notice.type)?.label ?? "";
  labelValue(doc, [
    ["Type", typeLabel],
    ["Notice reference", notice.reference ?? ""],
    ["Issued by", notice.issuer ?? ""],
    ["Date and time", `${ukDate(lookup.at)} at ${ukTime(lookup.at)} (UK time)`],
    [
      "Location",
      lookup.location
        ? `${lookup.location.label ? `${lookup.location.label} ` : ""}(${fmtCoord(lookup.location.lat)}, ${fmtCoord(lookup.location.lng)})`
        : "",
    ],
    ["Vehicle", lookup.vehicle ? `${lookup.vehicle.label}${lookup.vehicle.registration ? `, ${lookup.vehicle.registration}` : ""}` : ""],
  ]);

  heading(doc, "What MileClear recorded");
  for (const line of lookup.summary) {
    body(doc, line);
    doc.moveDown(0.2);
  }

  if (lookup.trips.length > 0) {
    heading(doc, `Journeys within ${lookup.windowMinutes} minutes either side`);
    table(
      doc,
      [
        { label: "Started", width: 70 },
        { label: "Ended", width: 50 },
        { label: "From", width: 145 },
        { label: "To", width: 145 },
        { label: "Miles", width: 40, align: "right" },
        { label: "Recorded", width: CONTENT_W - 450 },
      ],
      lookup.trips.map((t) => [
        `${ukDate(t.startedAt, false).slice(4)} ${ukTime(t.startedAt)}`,
        t.endedAt ? ukTime(t.endedAt) : "",
        t.startAddress ?? "",
        t.endAddress ?? "",
        t.distanceMiles.toFixed(1),
        t.isManualEntry ? "By hand" : `GPS, ${t.pointsInWindow} pts`,
      ])
    );
  }

  if (input.points.length > 0) {
    heading(doc, "Recorded route", 390);
    drawTrack(doc, input);
  }

  if (lookup.rows.length > 0) {
    heading(doc, "Recorded points around the time");
    const hl = new Set<number>();
    lookup.rows.forEach((r, i) => {
      if (r.recordedAt === lookup.nearestInTime?.recordedAt || r.recordedAt === lookup.nearestToLocation?.recordedAt) hl.add(i);
    });
    const hasLoc = !!lookup.location;
    table(
      doc,
      [
        { label: "Time (UK)", width: 70 },
        { label: "Latitude", width: 80, align: "right" },
        { label: "Longitude", width: 80, align: "right" },
        { label: "Speed (mph)", width: 75, align: "right" },
        { label: "Accuracy (m)", width: 80, align: "right" },
        { label: hasLoc ? "From notice location" : "", width: CONTENT_W - 385, align: "right" },
      ],
      lookup.rows.map((r) => [
        ukTime(r.recordedAt, true),
        fmtCoord(r.lat),
        fmtCoord(r.lng),
        r.speedMph == null ? "" : String(r.speedMph),
        r.accuracy == null ? "" : String(Math.round(r.accuracy)),
        r.distanceFromNoticeMetres == null ? "" : r.distanceFromNoticeMetres < 1000 ? `${r.distanceFromNoticeMetres} m` : `${(r.distanceFromNoticeMetres / 1609.344).toFixed(2)} mi`,
      ]),
      hl
    );
    body(
      doc,
      `Highlighted rows are the point closest in time to the notice and the point closest to the notice location. ` +
        `Rows are a sample of the points within 15 minutes either side; ${input.points.length} points were recorded in the full two-hour window.`,
      { size: 8, color: GREY_600 }
    );
  }

  if (lookup.gaps.length > 0) {
    heading(doc, "Gaps in recording");
    for (const g of lookup.gaps) body(doc, `${ukTime(g.from)} to ${ukTime(g.to)}: no points for ${g.minutes} minutes during a journey.`);
  }

  heading(doc, "How this was recorded");
  const acc = lookup.accuracy.medianMetres;
  body(
    doc,
    "MileClear records location with the phone's own GPS while a journey is being tracked. Each point is saved with the time, " +
      "the phone's own estimate of its accuracy in metres and, when the phone gives one, its speed. Points are kept on the phone " +
      "and uploaded to the driver's MileClear account. This document was produced from those stored points; times are UK time. " +
      (acc != null ? `Around this time the phone reported a typical accuracy of ${acc} metres.` : "")
  );

  heading(doc, "Statement");
  body(
    doc,
    "This is a record of where MileClear recorded this phone around the time given. It shows where the phone was, not who was " +
      "driving or which vehicle the phone was in. MileClear does not say whether any penalty is valid, and this is not legal advice."
  );
  doc.moveDown(0.3);
  for (const c of lookup.caveats) {
    body(doc, `• ${c}`, { size: 9, color: GREY_600 });
  }
  if (lookup.nearestInTime?.address || lookup.nearestToLocation?.address) {
    doc.moveDown(0.3);
    body(doc, "Street names from OpenStreetMap (© OpenStreetMap contributors).", { size: 7.5, color: GREY_400 });
  }

  // Footer on every page.
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const origBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = PAGE_H - 30;
    doc.moveTo(M, y).lineTo(PAGE_W - M, y).lineWidth(0.5).strokeColor(GREY_200).stroke();
    doc.font("Helvetica").fontSize(7).fillColor(GREY_400);
    doc.text(ref, M, y + 6, { lineBreak: false });
    doc.text("A record of where MileClear recorded this phone", M, y + 6, { width: CONTENT_W, align: "center", lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, M, y + 6, { width: CONTENT_W, align: "right", lineBreak: false });
    doc.page.margins.bottom = origBottom;
  }

  doc.end();
  return done;
}
