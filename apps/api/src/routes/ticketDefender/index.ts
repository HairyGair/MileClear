import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { premiumMiddleware } from "../../middleware/premium.js";
import { prisma } from "../../lib/prisma.js";
import { logEvent } from "../../services/appEvents.js";
import {
  lookupTicketRecord,
  lookupTicketRecordWithPoints,
  TicketDefenderInputError,
  type TicketDefenderInput,
} from "../../services/ticketDefender.js";
import { generateTicketDefenderPdf } from "../../services/ticketDefenderPdf.js";
import { CazPaidError, listCazCharges, setCazPaid } from "../../services/cazCharges.js";

/**
 * Ticket defender (Pro, Oct 2026).
 *
 *   POST /ticket-defender/lookup            what MileClear recorded around a notice's time
 *   GET  /ticket-defender/pack?...          the same as a PDF record
 *   GET  /ticket-defender/caz-charges       recent Clean Air Zone / ULEZ charges to pay
 *   POST /ticket-defender/caz-charges/:tripId/paid   tick or untick "I've paid"
 *
 * The lookup and pack never claim the record proves anything (see
 * services/ticketDefender.ts and shared utils/ticketDefender.ts).
 */

const num = z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().finite().optional());

const lookupSchema = z
  .object({
    at: z.string().min(10).max(40),
    lat: num.pipe(z.number().min(49).max(61).optional()),
    lng: num.pipe(z.number().min(-9).max(3).optional()),
    postcode: z.string().trim().max(10).optional(),
    locationLabel: z.string().trim().max(200).optional(),
    vehicleId: z.string().uuid().optional(),
  })
  .refine((b) => (b.lat == null) === (b.lng == null), { message: "Give both latitude and longitude, or neither." });

const packSchema = lookupSchema.and(
  z.object({
    noticeType: z.enum(["bus_lane", "parking", "moving_traffic", "clean_air_zone", "other"]).optional(),
    reference: z.string().trim().max(40).optional(),
    issuer: z.string().trim().max(80).optional(),
  })
);

const paidSchema = z.object({
  zoneId: z.string().min(1).max(40),
  paid: z.boolean().optional(),
});

function toInput(b: z.infer<typeof lookupSchema>): TicketDefenderInput {
  return {
    at: new Date(b.at),
    lat: b.lat ?? null,
    lng: b.lng ?? null,
    postcode: b.postcode || null,
    locationLabel: b.locationLabel || null,
    vehicleId: b.vehicleId ?? null,
  };
}

function fileStamp(iso: string): string {
  return iso.slice(0, 16).replace(/[-:T]/g, "");
}

export async function ticketDefenderRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);
  app.addHook("preHandler", premiumMiddleware);

  app.post("/lookup", { config: { rateLimit: { max: 30, timeWindow: "10 minutes" } } }, async (request, reply) => {
    const parsed = lookupSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });
    try {
      const data = await lookupTicketRecord(request.userId!, toInput(parsed.data));
      logEvent("ticket_defender.lookup", request.userId!, {
        status: data.status,
        hasLocation: !!data.location,
        trips: data.trips.length,
      });
      return reply.send({ data });
    } catch (err) {
      if (err instanceof TicketDefenderInputError) return reply.status(400).send({ error: err.message });
      throw err;
    }
  });

  app.get("/pack", { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } }, async (request, reply) => {
    const parsed = packSchema.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });
    try {
      const [{ lookup, points }, user] = await Promise.all([
        lookupTicketRecordWithPoints(request.userId!, toInput(parsed.data)),
        prisma.user.findUnique({ where: { id: request.userId! }, select: { fullName: true, displayName: true } }),
      ]);
      const pdf = await generateTicketDefenderPdf({
        lookup,
        points,
        userId: request.userId!,
        driverName: user?.fullName?.trim() || user?.displayName?.trim() || "Account holder",
        notice: {
          type: parsed.data.noticeType ?? null,
          reference: parsed.data.reference || null,
          issuer: parsed.data.issuer || null,
        },
      });
      logEvent("ticket_defender.pack", request.userId!, { status: lookup.status, points: points.length });
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="mileclear-journey-record-${fileStamp(lookup.at)}.pdf"`)
        .send(pdf);
    } catch (err) {
      if (err instanceof TicketDefenderInputError) return reply.status(400).send({ error: err.message });
      throw err;
    }
  });

  app.get("/caz-charges", async (request, reply) => {
    const data = await listCazCharges(request.userId!);
    return reply.send({ data });
  });

  app.post<{ Params: { tripId: string } }>("/caz-charges/:tripId/paid", async (request, reply) => {
    const parsed = paidSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });
    try {
      const data = await setCazPaid(request.userId!, request.params.tripId, parsed.data.zoneId, parsed.data.paid ?? true);
      logEvent("ticket_defender.caz_paid", request.userId!, { zoneId: parsed.data.zoneId, paid: data.paid });
      return reply.send({ data });
    } catch (err) {
      if (err instanceof CazPaidError) return reply.status(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
