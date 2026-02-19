import { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { z } from "zod";

const waitlistSchema = z.object({
  email: z.string().email(),
  driverType: z.string().optional(),
});

export async function waitlistRoutes(app: FastifyInstance) {
  app.post("/", async (request, reply) => {
    const body = waitlistSchema.parse(request.body);

    const entry = await prisma.waitlistEntry.upsert({
      where: { email: body.email },
      update: {},
      create: {
        email: body.email,
        driverType: body.driverType ?? null,
      },
    });

    return { data: { id: entry.id }, message: "You're on the list!" };
  });
}
