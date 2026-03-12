// TrueLayer Open Banking client configuration

const env = process.env.TRUELAYER_ENV || "sandbox";

export const TRUELAYER_AUTH_BASE =
  env === "production"
    ? "https://auth.truelayer.com"
    : "https://auth.truelayer-sandbox.com";

export const TRUELAYER_API_BASE =
  env === "production"
    ? "https://api.truelayer.com"
    : "https://api.truelayer-sandbox.com";

export const TRUELAYER_CLIENT_ID = process.env.TRUELAYER_CLIENT_ID || "";
export const TRUELAYER_CLIENT_SECRET = process.env.TRUELAYER_CLIENT_SECRET || "";

export const truelayerEnabled = !!(TRUELAYER_CLIENT_ID && TRUELAYER_CLIENT_SECRET);

if (!truelayerEnabled) {
  console.warn("TRUELAYER_CLIENT_ID / TRUELAYER_CLIENT_SECRET not set — Open Banking features disabled");
}
