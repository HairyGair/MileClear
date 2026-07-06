// Client book for the invoice builder (Get Paid, Jul 2026).
//
// Auth-only, NOT premium: the client book belongs to the free tracking
// tier (the paywall bites at invoice generation, not at organising who
// you work for). Clients referenced by invoices are soft-archived on
// delete so invoice history keeps its Bill-To data; never-invoiced
// clients hard-delete.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { logEvent } from "../../services/appEvents.js";

const emailField = z
  .string()
  .max(255)
  .email("That doesn't look like an email address")
  .or(z.literal(""))
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v || null));

const clientBody = z.object({
  name: z.string().min(1).max(200),
  email: emailField,
  phone: z.string().max(40).nullable().optional(),
  addressLine1: z.string().max(200).nullable().optional(),
  addressLine2: z.string().max(200).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  postcode: z.string().max(20).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const updateBody = clientBody.partial();

export async function clientRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // GET /clients — active by default; ?includeArchived=true for the lot.
  app.get("/", async (request, reply) => {
    const { includeArchived } = request.query as { includeArchived?: string };
    const clients = await prisma.client.findMany({
      where: {
        userId: request.userId!,
        ...(includeArchived === "true" ? {} : { archivedAt: null }),
      },
      orderBy: { name: "asc" },
      include: { _count: { select: { invoices: true } } },
    });
    return reply.send({ data: clients });
  });

  // POST /clients
  app.post("/", async (request, reply) => {
    const parsed = clientBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }
    const d = parsed.data;
    const client = await prisma.client.create({
      data: {
        userId: request.userId!,
        name: d.name,
        email: d.email ?? null,
        phone: d.phone ?? null,
        addressLine1: d.addressLine1 ?? null,
        addressLine2: d.addressLine2 ?? null,
        city: d.city ?? null,
        postcode: d.postcode ?? null,
        notes: d.notes ?? null,
      },
    });
    logEvent("client.created", request.userId!, { clientId: client.id });
    return reply.status(201).send({ data: client });
  });

  // GET /clients/:id
  app.get("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const client = await prisma.client.findFirst({
      where: { id, userId: request.userId! },
      include: { _count: { select: { invoices: true } } },
    });
    if (!client) return reply.status(404).send({ error: "Client not found" });
    return reply.send({ data: client });
  });

  // PATCH /clients/:id
  app.patch("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const parsed = updateBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }
    const existing = await prisma.client.findFirst({
      where: { id, userId: request.userId! },
      select: { id: true },
    });
    if (!existing) return reply.status(404).send({ error: "Client not found" });

    const d = parsed.data;
    const client = await prisma.client.update({
      where: { id },
      data: Object.fromEntries(
        Object.entries(d).filter(([, v]) => v !== undefined)
      ),
    });
    return reply.send({ data: client });
  });

  // DELETE /clients/:id — archive when invoiced, hard-delete otherwise.
  app.delete("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const existing = await prisma.client.findFirst({
      where: { id, userId: request.userId! },
      include: { _count: { select: { invoices: true } } },
    });
    if (!existing) return reply.status(404).send({ error: "Client not found" });

    if (existing._count.invoices > 0) {
      await prisma.client.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
      logEvent("client.archived", request.userId!, { clientId: id });
      return reply.send({ data: { archived: true, deleted: false } });
    }

    await prisma.client.delete({ where: { id } });
    logEvent("client.deleted", request.userId!, { clientId: id });
    return reply.send({ data: { archived: false, deleted: true } });
  });
}
