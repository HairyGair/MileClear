// Practice accounts: the admin queue. New practices show to drivers as
// "Not checked yet" until an admin ticks them here. The tick covers the
// practice AND its current logo; a logo changed later goes back to the
// initials tile until it is ticked again.

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { authMiddleware } from "../../middleware/auth.js";
import { adminMiddleware } from "../../middleware/admin.js";
import { logEvent } from "../../services/appEvents.js";
import { practiceInitials } from "@mileclear/shared";
import { logoIsChecked } from "./shared.js";

const idParams = z.object({ id: z.string().uuid() });

export async function practiceAdminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);
  app.addHook("preHandler", adminMiddleware);

  // GET /admin/practices: unchecked (and logo waiting) first, then the rest.
  app.get("/", async (_request, reply) => {
    const rows = await prisma.practice.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        name: true,
        contactName: true,
        email: true,
        phone: true,
        professionalBody: true,
        arn: true,
        status: true,
        checkedAt: true,
        suspendedAt: true,
        reportCount: true,
        lastReportedAt: true,
        createdAt: true,
        logo: { select: { updatedAt: true, checkedAt: true, bytes: true, mime: true } },
        _count: { select: { members: true } },
      },
    });
    const live = await prisma.practiceLink.groupBy({
      by: ["practiceId"],
      where: { status: "active", endsAt: { gt: new Date() } },
      _count: { _all: true },
    });
    const liveBy = new Map(live.map((g) => [g.practiceId, g._count._all]));
    const shaped = rows.map((p) => {
      const logoChecked = p.logo ? logoIsChecked({ ...p, contactName: p.contactName, logo: p.logo }) : false;
      return {
        id: p.id,
        name: p.name,
        initials: practiceInitials(p.name),
        contactName: p.contactName,
        email: p.email,
        phone: p.phone,
        professionalBody: p.professionalBody,
        arn: p.arn,
        checked: p.status === "checked",
        checkedAt: p.checkedAt?.toISOString() ?? null,
        paused: !!p.suspendedAt,
        reportCount: p.reportCount,
        lastReportedAt: p.lastReportedAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
        members: p._count.members,
        liveClients: liveBy.get(p.id) ?? 0,
        logo: p.logo
          ? {
              updatedAt: p.logo.updatedAt.toISOString(),
              bytes: p.logo.bytes,
              mime: p.logo.mime,
              // Uploaded or changed since the last tick.
              waiting: !p.logo.checkedAt || p.logo.checkedAt.getTime() < p.logo.updatedAt.getTime(),
              shownToDrivers: logoChecked,
            }
          : null,
      };
    });
    const needsLook = (x: (typeof shaped)[number]) => !x.checked || x.logo?.waiting || x.reportCount > 0;
    shaped.sort((a, b) => Number(needsLook(b)) - Number(needsLook(a)));
    return reply.send({ data: shaped });
  });

  // GET /admin/practices/:id/logo: the logo as uploaded, for checking.
  app.get("/:id/logo", async (request, reply) => {
    const p = idParams.safeParse(request.params);
    if (!p.success) return reply.status(400).send({ error: "Invalid id" });
    const logo = await prisma.practiceLogo.findUnique({ where: { practiceId: p.data.id } });
    if (!logo) return reply.status(404).send({ error: "No logo" });
    return reply.header("Content-Type", logo.mime).header("Cache-Control", "private, no-store").send(Buffer.from(logo.data));
  });

  // POST /admin/practices/:id/check: tick the practice and its current logo.
  app.post("/:id/check", async (request, reply) => {
    const p = idParams.safeParse(request.params);
    if (!p.success) return reply.status(400).send({ error: "Invalid id" });
    const now = new Date();
    const practice = await prisma.practice.findUnique({ where: { id: p.data.id }, select: { id: true } });
    if (!practice) return reply.status(404).send({ error: "Not found" });
    await prisma.practice.update({
      where: { id: p.data.id },
      data: { status: "checked", checkedAt: now, checkedByUserId: request.userId! },
    });
    await prisma.practiceLogo.updateMany({ where: { practiceId: p.data.id }, data: { checkedAt: now } });
    logEvent("practice.checked", request.userId!, { practiceId: p.data.id });
    return reply.send({ data: { ok: true } });
  });

  // POST /admin/practices/:id/uncheck: back to "Not checked yet".
  app.post("/:id/uncheck", async (request, reply) => {
    const p = idParams.safeParse(request.params);
    if (!p.success) return reply.status(400).send({ error: "Invalid id" });
    await prisma.practice.update({
      where: { id: p.data.id },
      data: { status: "unchecked", checkedAt: null, checkedByUserId: null },
    });
    await prisma.practiceLogo.updateMany({ where: { practiceId: p.data.id }, data: { checkedAt: null } });
    logEvent("practice.unchecked", request.userId!, { practiceId: p.data.id });
    return reply.send({ data: { ok: true } });
  });

  // POST /admin/practices/:id/pause and /resume: nothing is shared while paused.
  app.post("/:id/pause", async (request, reply) => {
    const p = idParams.safeParse(request.params);
    if (!p.success) return reply.status(400).send({ error: "Invalid id" });
    await prisma.practice.update({ where: { id: p.data.id }, data: { suspendedAt: new Date() } });
    logEvent("practice.paused", request.userId!, { practiceId: p.data.id });
    return reply.send({ data: { ok: true } });
  });

  app.post("/:id/resume", async (request, reply) => {
    const p = idParams.safeParse(request.params);
    if (!p.success) return reply.status(400).send({ error: "Invalid id" });
    await prisma.practice.update({ where: { id: p.data.id }, data: { suspendedAt: null } });
    logEvent("practice.resumed", request.userId!, { practiceId: p.data.id });
    return reply.send({ data: { ok: true } });
  });

  // DELETE /admin/practices/:id/logo: remove a logo that should not be there.
  app.delete("/:id/logo", async (request, reply) => {
    const p = idParams.safeParse(request.params);
    if (!p.success) return reply.status(400).send({ error: "Invalid id" });
    await prisma.practiceLogo.deleteMany({ where: { practiceId: p.data.id } });
    logEvent("practice.logo_removed", request.userId!, { practiceId: p.data.id });
    return reply.send({ data: { ok: true } });
  });
}
