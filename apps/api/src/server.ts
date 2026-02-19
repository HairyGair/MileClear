import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
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

const PORT = Number(process.env.API_PORT) || 3001;
const HOST = process.env.API_HOST || "0.0.0.0";

const app = Fastify({
  logger: true,
});

// Plugins
await app.register(cors, {
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  credentials: true,
});

await app.register(cookie);

await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

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

// Health check
app.get("/health", async () => ({ status: "ok" }));

// Start server
try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`MileClear API running on http://${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
