import { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { premiumMiddleware } from "../../middleware/premium.js";
import {
  generateTripsCsv,
  generateTripsPdf,
  generateSelfAssessmentPdf,
  formatXeroExpense,
  formatFreeAgentExpense,
  formatQuickBooksExpense,
} from "../../services/export.js";
import { logEvent } from "../../services/appEvents.js";
import { nzLogbookRoutes } from "./nzLogbook.js";
import {
  generateOdometerLogCsv,
  inclusiveDayCount,
  taxYearDateRange,
} from "../../services/odometer.js";
import { defaultVehicleIdForUser } from "../../services/vehicleDefaults.js";
import { prisma } from "../../lib/prisma.js";
import {
  exportProjectSlug,
  exportVehicleSlug,
  parseTaxYear,
  PROJECT_LABEL_MAX_LENGTH,
} from "@mileclear/shared";
import {
  exportVehicleTripWhere,
  resolveExportVehicle,
  type ExportVehicle,
} from "../../services/export-data.js";
import {
  projectLabelTripWhere,
  resolveProjectLabel,
  type ProjectLabelMatch,
} from "../../services/projectTotals.js";

interface DateRangeQuery {
  taxYear?: string;
  from?: string;
  to?: string;
  classification?: "business" | "personal";
  /** One car only (CSV and Trip Report). Left out: every car. */
  vehicleId?: string;
  /** One Project / client only (CSV and Trip Report). Left out: every client. */
  projectLabel?: string;
}

/** One vehicleId string, or none. ?vehicleId=a&vehicleId=b arrives as an array. */
const vehicleIdSchema = z.string().min(1).max(64).optional();

/**
 * The vehicle for a one-vehicle CSV or Trip Report. undefined: every vehicle.
 * "invalid": not a single sensible id (400). null: not one of this user's
 * vehicles (404).
 */
async function vehicleForQuery(
  userId: string,
  vehicleId: unknown
): Promise<ExportVehicle | undefined | null | "invalid"> {
  if (vehicleId === undefined) return undefined;
  const parsed = vehicleIdSchema.safeParse(vehicleId);
  if (!parsed.success) return "invalid";
  if (!parsed.data) return undefined;
  return resolveExportVehicle(userId, parsed.data);
}

/** One Project / client label, or none. Repeated, empty or over 100 characters: invalid. */
const projectLabelSchema = z.string().trim().min(1).max(PROJECT_LABEL_MAX_LENGTH);

/**
 * The client for a one-client CSV or Trip Report (23 Oct 2026), matched by
 * projectLabelKey like Miles by project. undefined: every client. "invalid":
 * not a single sensible label (400). null: none of this user's trips has
 * that label (404).
 */
async function projectForQuery(
  userId: string,
  projectLabel: unknown
): Promise<ProjectLabelMatch | undefined | null | "invalid"> {
  if (projectLabel === undefined) return undefined;
  const parsed = projectLabelSchema.safeParse(projectLabel);
  if (!parsed.success) return "invalid";
  return resolveProjectLabel(userId, parsed.data);
}

/**
 * "trips", "trips-nissan-qashqai-ab12cde", "trips-nhs-trust" or
 * "trips-nhs-trust-nissan-qashqai-ab12cde", for the file name.
 */
function tripsFileType(vehicle: ExportVehicle | undefined, project?: ProjectLabelMatch): string {
  const parts = ["trips"];
  if (project) parts.push(exportProjectSlug(project.label));
  if (vehicle) parts.push(exportVehicleSlug(vehicle));
  return parts.join("-");
}

/** "trips", "trips in that car", "trips for that client" or both, for emptyExportMessage. */
function emptyTripsWhat(vehicle: ExportVehicle | undefined, project: ProjectLabelMatch | undefined): string {
  return ["trips", project ? "for that client" : null, vehicle ? "in that car" : null].filter(Boolean).join(" ");
}

interface AccountingBody {
  taxYear: string;
}

function buildFilename(type: string, taxYear: string, ext: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `mileclear-${type}-${taxYear}-${date}.${ext}`;
}

function parseQueryOpts(query: DateRangeQuery) {
  const { taxYear, from, to, classification } = query;

  if (taxYear && (from || to)) {
    throw new Error("Provide taxYear or from+to, not both");
  }
  if (!taxYear && (!from || !to)) {
    throw new Error("Provide taxYear or both from and to");
  }

  return {
    taxYear: taxYear || undefined,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    classification: classification || undefined,
  };
}

/**
 * Refuse to hand someone a blank document.
 *
 * Exports are the headline Pro feature and the first thing a new subscriber
 * reaches for. Jakub Zychla (15 Aug 2026) subscribed, ran the PDF, the
 * self-assessment and the CSV within 27 minutes, and had deleted his only trip
 * beforehand - so all three came back empty and he filed for a refund inside
 * two hours. An empty file reads as a broken product, not as "no data yet".
 *
 * Deliberately conservative: it blocks only when the document would genuinely
 * have nothing in it. Letting a thin export through is a far smaller mistake
 * than blocking a legitimate one, so the self-assessment report - which also
 * carries earnings - is allowed whenever EITHER trips or earnings exist.
 */
async function countExportableData(
  userId: string,
  opts: {
    taxYear?: string;
    from?: Date;
    to?: Date;
    classification?: string;
    vehicle?: Pick<ExportVehicle, "id" | "includesUnassigned">;
    project?: Pick<ProjectLabelMatch, "where">;
  },
  includeEarnings: boolean
): Promise<{ trips: number; earnings: number }> {
  let start: Date;
  let end: Date;
  if (opts.taxYear) {
    const range = parseTaxYear(opts.taxYear);
    start = range.start;
    end = range.end;
  } else {
    start = opts.from!;
    end = opts.to!;
  }

  // Mirrors fetchExportTrips' filter exactly, phantoms included, or the count
  // and the document could disagree.
  const where = {
    userId,
    isPhantomTrip: false,
    startedAt: { gte: start, lte: end },
    ...(opts.classification ? { classification: opts.classification } : {}),
    ...(opts.vehicle ? exportVehicleTripWhere(opts.vehicle) : {}),
    ...(opts.project ? projectLabelTripWhere(opts.project) : {}),
  };
  const [trips, earnings] = await Promise.all([
    // One client: resolveProjectLabel's where is byte-exact, the same trips
    // fetchExportTrips keeps by projectLabelKey.
    prisma.trip.count({ where }),
    includeEarnings
      ? prisma.earning.count({
          where: { userId, periodStart: { gte: start, lte: end } },
        })
      : Promise.resolve(0),
  ]);
  return { trips, earnings };
}

/** Wording that still makes sense under the mobile client's "Export failed" title. */
function emptyExportMessage(taxYear: string | undefined, what: string): string {
  const period = taxYear ? `the ${taxYear} tax year` : "that date range";
  return `There are no ${what} in ${period} yet, so this export would come out empty. Add or record one first and it will have something to show.`;
}

export async function exportRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);
  app.addHook("preHandler", premiumMiddleware);

  // New Zealand 90-day logbook (PDF and CSV), behind the same auth and Pro checks.
  await nzLogbookRoutes(app);

  // CSV download
  app.get("/csv", async (request: FastifyRequest<{ Querystring: DateRangeQuery }>, reply) => {
    const opts = parseQueryOpts(request.query);
    const vehicle = await vehicleForQuery(request.userId!, request.query.vehicleId);
    if (vehicle === "invalid") return reply.status(400).send({ error: "Invalid vehicle" });
    if (vehicle === null) return reply.status(404).send({ error: "Vehicle not found" });
    const project = await projectForQuery(request.userId!, request.query.projectLabel);
    if (project === "invalid") return reply.status(400).send({ error: "Invalid client" });
    if (project === null) return reply.status(404).send({ error: "Client not found" });

    const { trips } = await countExportableData(request.userId!, { ...opts, vehicle, project }, false);
    if (trips === 0) {
      logEvent("export.blocked_empty", request.userId!, { format: "csv", taxYear: opts.taxYear, oneCar: !!vehicle, oneClient: !!project });
      return reply.status(400).send({ error: emptyExportMessage(opts.taxYear, emptyTripsWhat(vehicle, project)) });
    }

    const csv = await generateTripsCsv(request.userId!, { ...opts, vehicle, project });
    const filename = buildFilename(tripsFileType(vehicle, project), opts.taxYear || "custom", "csv");

    logEvent("export.csv", request.userId!, { taxYear: opts.taxYear, oneCar: !!vehicle, oneClient: !!project });

    return reply
      .header("Content-Type", "text/csv")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(csv);
  });

  // Odometer log CSV: start and end readings for each day driven (spec: docs/odometer-oct2026).
  app.get(
    "/odometer-log",
    async (
      request: FastifyRequest<{ Querystring: { vehicleId?: string; taxYear?: string; from?: string; to?: string } }>,
      reply
    ) => {
      const userId = request.userId!;
      const q = request.query;
      const dateRe = /^\d{4}-\d{2}-\d{2}$/;

      let from: string;
      let to: string;
      if (q.taxYear && (q.from || q.to)) {
        return reply.status(400).send({ error: "Provide taxYear or from+to, not both" });
      } else if (q.taxYear) {
        try {
          ({ from, to } = taxYearDateRange(q.taxYear));
        } catch {
          return reply.status(400).send({ error: "That tax year doesn't look right." });
        }
      } else if (q.from && q.to && dateRe.test(q.from) && dateRe.test(q.to) && !Number.isNaN(Date.parse(q.from)) && !Number.isNaN(Date.parse(q.to))) {
        from = q.from;
        to = q.to;
      } else {
        return reply.status(400).send({ error: "Provide taxYear or both from and to (YYYY-MM-DD)" });
      }
      if (from > to || inclusiveDayCount(from, to) > 366) {
        return reply.status(400).send({ error: "Pick a range of 366 days or fewer." });
      }

      const vehicleId = q.vehicleId || (await defaultVehicleIdForUser(userId));
      if (!vehicleId) {
        // No default: either no vehicle at all, or several with none marked main.
        const hasVehicles = (await prisma.vehicle.count({ where: { userId } })) > 0;
        return reply.status(400).send({
          error: hasVehicles
            ? "Pick which vehicle the odometer log is for."
            : "Add a vehicle first. The odometer belongs to a vehicle.",
        });
      }

      const result = await generateOdometerLogCsv(userId, { vehicleId, from, to });
      if (!result) {
        return reply.status(404).send({ error: "Vehicle not found" });
      }
      if (result.dayCount === 0) {
        logEvent("export.blocked_empty", userId, { format: "odometer_log", from, to });
        return reply.status(400).send({
          error: "There is no driving or odometer reading in that date range yet, so this export would come out empty.",
        });
      }

      logEvent("export.odometer_log", userId, { from, to });
      return reply
        .header("Content-Type", "text/csv")
        .header("Content-Disposition", `attachment; filename="mileclear-odometer-log-${from}-to-${to}.csv"`)
        .send(result.csv);
    }
  );

  // PDF trip report download
  app.get("/pdf", async (request: FastifyRequest<{ Querystring: DateRangeQuery }>, reply) => {
    const opts = parseQueryOpts(request.query);
    const vehicle = await vehicleForQuery(request.userId!, request.query.vehicleId);
    if (vehicle === "invalid") return reply.status(400).send({ error: "Invalid vehicle" });
    if (vehicle === null) return reply.status(404).send({ error: "Vehicle not found" });
    const project = await projectForQuery(request.userId!, request.query.projectLabel);
    if (project === "invalid") return reply.status(400).send({ error: "Invalid client" });
    if (project === null) return reply.status(404).send({ error: "Client not found" });

    const { trips } = await countExportableData(request.userId!, { ...opts, vehicle, project }, false);
    if (trips === 0) {
      logEvent("export.blocked_empty", request.userId!, { format: "pdf", taxYear: opts.taxYear, oneCar: !!vehicle, oneClient: !!project });
      return reply.status(400).send({ error: emptyExportMessage(opts.taxYear, emptyTripsWhat(vehicle, project)) });
    }

    const pdf = await generateTripsPdf(request.userId!, { ...opts, vehicle, project });
    const filename = buildFilename(tripsFileType(vehicle, project), opts.taxYear || "custom", "pdf");

    logEvent("export.pdf", request.userId!, { taxYear: opts.taxYear, oneCar: !!vehicle, oneClient: !!project });

    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(pdf);
  });

  // Self-assessment PDF download
  app.get(
    "/self-assessment",
    async (request: FastifyRequest<{ Querystring: { taxYear: string } }>, reply) => {
      const { taxYear } = request.query;
      if (!taxYear) {
        return reply.status(400).send({ error: "taxYear is required" });
      }

      const { trips, earnings } = await countExportableData(
        request.userId!,
        { taxYear },
        true
      );
      if (trips === 0 && earnings === 0) {
        logEvent("export.blocked_empty", request.userId!, {
          format: "self_assessment",
          taxYear,
        });
        return reply
          .status(400)
          .send({ error: emptyExportMessage(taxYear, "trips or earnings") });
      }

      const pdf = await generateSelfAssessmentPdf(request.userId!, taxYear);
      const filename = buildFilename("self-assessment", taxYear, "pdf");

      logEvent("export.self_assessment", request.userId!, { taxYear });

      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(pdf);
    }
  );

  // Xero — coming soon
  app.post("/xero", async (request: FastifyRequest<{ Body: AccountingBody }>, reply) => {
    const { taxYear } = request.body;
    if (!taxYear) {
      return reply.status(400).send({ error: "taxYear is required" });
    }

    const preview = await formatXeroExpense(request.userId!, taxYear);
    return reply.send({
      status: "coming_soon",
      message: "Xero integration is coming soon. Here's a preview of what will be exported.",
      preview,
    });
  });

  // FreeAgent — coming soon
  app.post("/freeagent", async (request: FastifyRequest<{ Body: AccountingBody }>, reply) => {
    const { taxYear } = request.body;
    if (!taxYear) {
      return reply.status(400).send({ error: "taxYear is required" });
    }

    const preview = await formatFreeAgentExpense(request.userId!, taxYear);
    return reply.send({
      status: "coming_soon",
      message: "FreeAgent integration is coming soon. Here's a preview of what will be exported.",
      preview,
    });
  });

  // QuickBooks — coming soon
  app.post("/quickbooks", async (request: FastifyRequest<{ Body: AccountingBody }>, reply) => {
    const { taxYear } = request.body;
    if (!taxYear) {
      return reply.status(400).send({ error: "taxYear is required" });
    }

    const preview = await formatQuickBooksExpense(request.userId!, taxYear);
    return reply.send({
      status: "coming_soon",
      message: "QuickBooks integration is coming soon. Here's a preview of what will be exported.",
      preview,
    });
  });
}
