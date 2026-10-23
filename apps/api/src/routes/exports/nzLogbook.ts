import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { regimeFor, resolveLogbookPeriod } from "@mileclear/shared";
import { prisma } from "../../lib/prisma.js";
import { effectiveCountry } from "../../lib/countrySetting.js";
import { logEvent } from "../../services/appEvents.js";
import { defaultVehicleIdForUser } from "../../services/vehicleDefaults.js";
import { loadNzLogbook, nzLogbookCsv, nzLogbookPdf, type NzLogbook } from "../../services/nzLogbook.js";

// GET /exports/logbook-pdf and /exports/logbook-csv (23 Oct 2026): IRD's
// 90-day vehicle logbook for New Zealand drivers. Registered inside
// exportRoutes, so auth and Pro already apply. Query: vehicleId (optional:
// the default vehicle), from (YYYY-MM-DD, New Zealand date) and to (optional:
// 90 days from `from`; longer is allowed, shorter is refused).

interface LogbookQuery {
  vehicleId?: string;
  from?: string;
  to?: string;
}

async function buildFor(
  request: FastifyRequest<{ Querystring: LogbookQuery }>,
  reply: FastifyReply,
  format: "pdf" | "csv"
): Promise<NzLogbook | null> {
  const userId = request.userId!;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true, country: true } });
  if (!user) {
    reply.status(404).send({ error: "User not found" });
    return null;
  }
  if (regimeFor(effectiveCountry(user))?.id !== "nz-ird") {
    reply.status(403).send({ error: "Not available in your country" });
    return null;
  }

  const q = request.query;
  if (typeof q.from !== "string" || (q.to !== undefined && typeof q.to !== "string")) {
    reply.status(400).send({ error: "Pick the first day of the logbook (YYYY-MM-DD)." });
    return null;
  }
  const period = resolveLogbookPeriod(q.from, q.to);
  if (!period.ok) {
    reply.status(400).send({ error: period.error });
    return null;
  }

  if (q.vehicleId !== undefined && (typeof q.vehicleId !== "string" || !q.vehicleId || q.vehicleId.length > 64)) {
    reply.status(400).send({ error: "Invalid vehicle" });
    return null;
  }
  const vehicleId = q.vehicleId || (await defaultVehicleIdForUser(userId));
  if (!vehicleId) {
    const hasVehicles = (await prisma.vehicle.count({ where: { userId } })) > 0;
    reply.status(400).send({
      error: hasVehicles ? "Pick which vehicle the logbook is for." : "Add a vehicle first. A logbook is for one vehicle.",
    });
    return null;
  }

  const book = await loadNzLogbook(userId, vehicleId, period);
  if (!book) {
    reply.status(404).send({ error: "Vehicle not found" });
    return null;
  }
  if (book.rows.length === 0) {
    logEvent("export.blocked_empty", userId, { format: `nz_logbook_${format}`, from: period.from, to: period.to });
    reply.status(400).send({ error: "There are no trips for this vehicle in that period, so the logbook would come out empty." });
    return null;
  }
  logEvent(`export.nz_logbook_${format}`, userId, { from: period.from, to: period.to, days: period.days });
  return book;
}

function filename(book: NzLogbook, ext: "pdf" | "csv"): string {
  return `mileclear-logbook-${book.from}-to-${book.to}.${ext}`;
}

export async function nzLogbookRoutes(app: FastifyInstance) {
  app.get("/logbook-pdf", async (request: FastifyRequest<{ Querystring: LogbookQuery }>, reply) => {
    const book = await buildFor(request, reply, "pdf");
    if (!book) return reply;
    const pdf = await nzLogbookPdf(book);
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="${filename(book, "pdf")}"`)
      .send(pdf);
  });

  app.get("/logbook-csv", async (request: FastifyRequest<{ Querystring: LogbookQuery }>, reply) => {
    const book = await buildFor(request, reply, "csv");
    if (!book) return reply;
    return reply
      .header("Content-Type", "text/csv")
      .header("Content-Disposition", `attachment; filename="${filename(book, "csv")}"`)
      .send(nzLogbookCsv(book));
  });
}
