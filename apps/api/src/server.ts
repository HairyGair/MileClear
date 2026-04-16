import "dotenv/config";
import Fastify from "fastify";
import { ZodError } from "zod";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { authRoutes } from "./routes/auth/index.js";
import { shiftRoutes } from "./routes/shifts/index.js";
import { tripRoutes } from "./routes/trips/index.js";
import { vehicleRoutes } from "./routes/vehicles/index.js";
import { fuelRoutes } from "./routes/fuel/index.js";
import { earningRoutes } from "./routes/earnings/index.js";
import { gamificationRoutes } from "./routes/gamification/index.js";
import { exportRoutes } from "./routes/exports/index.js";
import { billingRoutes } from "./routes/billing/index.js";
import { syncRoutes } from "./routes/sync/index.js";
import { userRoutes } from "./routes/user/index.js";
import { waitlistRoutes } from "./routes/waitlist/index.js";
import { adminRoutes } from "./routes/admin/index.js";
import { feedbackRoutes } from "./routes/feedback/index.js";
import { notificationRoutes } from "./routes/notifications/index.js";
import { savedLocationRoutes } from "./routes/savedLocations/index.js";
import { businessInsightRoutes } from "./routes/businessInsights/index.js";
import { communityInsightRoutes } from "./routes/communityInsights/index.js";
import { analyticsRoutes } from "./routes/analytics/index.js";
import { expenseRoutes } from "./routes/expenses/index.js";
import { accountantRoutes } from "./routes/accountant/index.js";
import { selfAssessmentRoutes } from "./routes/selfAssessment/index.js";
import { startNotificationJobs } from "./jobs/notifications.js";
import { startBriefingJobs } from "./jobs/briefing.js";
import { logEvent, trackErrorForAlert } from "./services/appEvents.js";

// Validate required secrets at startup
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("FATAL: JWT_SECRET is missing or too short (minimum 32 characters)");
  process.exit(1);
}
if (!JWT_REFRESH_SECRET || JWT_REFRESH_SECRET.length < 32) {
  console.error("FATAL: JWT_REFRESH_SECRET is missing or too short (minimum 32 characters)");
  process.exit(1);
}
if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_WEBHOOK_SECRET) {
  console.warn("WARNING: STRIPE_SECRET_KEY set but STRIPE_WEBHOOK_SECRET missing — webhooks will be rejected");
}

const PORT = Number(process.env.API_PORT) || 3001;
const HOST = process.env.API_HOST || "0.0.0.0";

const app = Fastify({
  trustProxy: true,
  bodyLimit: 10_485_760, // 10MB (trips with up to 20k coords can be ~3MB)
  logger: {
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
    redact: ["req.headers.authorization"],
  },
});

// Plugins
await app.register(helmet, {
  contentSecurityPolicy: false, // API serves JSON, not HTML
});

await app.register(cors, {
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)
    : ["http://localhost:3003"],
  credentials: true,
});

await app.register(cookie);

await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

// Global error handler — prevent stack trace / schema leakage
app.setErrorHandler((error: Error & { statusCode?: number; validation?: unknown }, request, reply) => {
  if (error instanceof ZodError) {
    return reply.status(400).send({ error: error.issues[0]?.message ?? "Validation error" });
  }
  // Fastify validation errors (from schema validation)
  if (error.validation) {
    return reply.status(400).send({ error: error.message });
  }
  // Rate limit errors
  if (error.statusCode === 429) {
    return reply.status(429).send({ error: "Too many requests" });
  }
  // Log server errors, return generic message
  request.log.error(error);
  const statusCode = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
  if (statusCode >= 500) {
    logEvent("error.500", (request as any).userId ?? null, {
      path: request.url,
      method: request.method,
      message: error.message,
    });
    trackErrorForAlert();
    return reply.status(500).send({ error: "Internal server error" });
  }
  return reply.status(statusCode).send({ error: error.message });
});

// Log slow requests (>2s response time)
app.addHook("onResponse", (request, reply, done) => {
  const duration = reply.elapsedTime;
  if (duration > 2000) {
    logEvent("perf.slow_request", (request as any).userId ?? null, {
      path: request.url,
      method: request.method,
      statusCode: reply.statusCode,
      durationMs: Math.round(duration),
    });
  }
  done();
});

// Routes
await app.register(authRoutes, { prefix: "/auth" });
await app.register(shiftRoutes, { prefix: "/shifts" });
await app.register(tripRoutes, { prefix: "/trips" });
await app.register(vehicleRoutes, { prefix: "/vehicles" });
await app.register(fuelRoutes, { prefix: "/fuel" });
await app.register(earningRoutes, { prefix: "/earnings" });
await app.register(gamificationRoutes, { prefix: "/gamification" });
await app.register(exportRoutes, { prefix: "/exports" });
await app.register(billingRoutes, { prefix: "/billing" });
await app.register(syncRoutes, { prefix: "/sync" });
await app.register(userRoutes, { prefix: "/user" });
await app.register(waitlistRoutes, { prefix: "/waitlist" });
await app.register(adminRoutes, { prefix: "/admin" });
await app.register(feedbackRoutes, { prefix: "/feedback" });
await app.register(notificationRoutes, { prefix: "/notifications" });
await app.register(savedLocationRoutes, { prefix: "/saved-locations" });
await app.register(businessInsightRoutes, { prefix: "/business-insights" });
await app.register(communityInsightRoutes, { prefix: "/community-insights" });
await app.register(analyticsRoutes, { prefix: "/analytics" });
await app.register(expenseRoutes, { prefix: "/expenses" });
await app.register(accountantRoutes, { prefix: "/accountant" });
await app.register(selfAssessmentRoutes, { prefix: "/self-assessment" });
// Health check
app.get("/health", async () => ({ status: "ok" }));

// Start server
try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`MileClear API running on http://${HOST}:${PORT}`);
  startNotificationJobs();
  startBriefingJobs();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
