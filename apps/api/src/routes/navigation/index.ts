import { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { authMiddleware } from "../../middleware/auth.js";
import { logEvent } from "../../services/appEvents.js";
import { fetchNavRoute, navigationEnabledFor, parseHeading, parseLatLng } from "../../services/navigation.js";

// In-app navigation (18 Oct 2026). docs/navigation-build-oct2026.md.
// Hidden behind NAVIGATION_ENABLED + admins / NAVIGATION_USER_IDS until
// locked-phone drives show trip recording is unaffected.
export async function navigationRoutes(app: FastifyInstance) {
  // GET /navigation/route?from=lat,lng&to=lat,lng[&heading=deg]
  // `heading` (the car's direction, 0-359) makes the route start the way the
  // car is already travelling; the app sends it on reroutes and when moving.
  app.get(
    "/route",
    { preHandler: [authMiddleware], config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const user = await prisma.user.findUnique({ where: { id: request.userId! }, select: { id: true, isAdmin: true } });
      if (!user || !navigationEnabledFor(user)) {
        return reply.status(403).send({ error: "Navigation isn't switched on for your account yet.", code: "NAVIGATION_NOT_ENABLED" });
      }
      const q = request.query as { from?: string; to?: string; heading?: string };
      const from = parseLatLng(q.from);
      const to = parseLatLng(q.to);
      if (!from || !to) {
        return reply.status(400).send({ error: "from and to must be lat,lng", code: "BAD_INPUT" });
      }

      const result = await fetchNavRoute(from, to, process.env, parseHeading(q.heading));
      if (!result.ok) {
        logEvent("navigation.route_failed", user.id, { code: result.code, detail: result.detail?.slice(0, 200) ?? null });
        if (result.code === "NO_ROUTE") {
          return reply.status(404).send({ error: "No route found between those places.", code: "NO_ROUTE" });
        }
        return reply.status(503).send({ error: "Routing isn't available right now.", code: "ROUTING_UNAVAILABLE" });
      }
      // Counts only: never the places themselves.
      logEvent("navigation.route", user.id, {
        routeId: result.route.routeId,
        miles: Math.round((result.route.distanceMeters / 1609.344) * 10) / 10,
        steps: result.route.steps.length,
        profile: result.route.profile,
      });
      return reply.send({ data: result.route });
    }
  );
}
