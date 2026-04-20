import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  JWSTransactionDecodedPayload,
  JWSRenewalInfoDecodedPayload,
  VerificationException,
  VerificationStatus,
} from "@apple/app-store-server-library";
import * as fs from "fs";
import * as path from "path";

const PRODUCT_ID_MONTHLY = "com.mileclear.premium.monthly";
const PRODUCT_ID_ANNUAL = "com.mileclear.premium.annual";
const VALID_PRODUCT_IDS = [PRODUCT_ID_MONTHLY, PRODUCT_ID_ANNUAL];

// --- Singleton client (null if not configured, same pattern as lib/stripe.ts) ---

let appleClient: AppStoreServerAPIClient | null = null;
// Primary verifier matches APPLE_IAP_ENVIRONMENT (used by /validate, which talks to
// the matching AppStoreServerAPIClient). The per-env verifiers are used by the
// webhook path, which must accept JWS from either environment because TestFlight
// testers (Sandbox) and real App Store customers (Production) both hit the same
// endpoint — otherwise Apple returns INVALID_ENVIRONMENT and the webhook is dropped.
let signedDataVerifier: SignedDataVerifier | null = null;
let signedDataVerifierSandbox: SignedDataVerifier | null = null;
let signedDataVerifierProduction: SignedDataVerifier | null = null;

const keyId = process.env.APPLE_IAP_KEY_ID;
const issuerId = process.env.APPLE_IAP_ISSUER_ID;
const privateKeyBase64 = process.env.APPLE_IAP_PRIVATE_KEY;
const bundleId = process.env.APPLE_IAP_BUNDLE_ID || "com.mileclear.app";
// Numeric App Apple ID (a.k.a. trackId from itunes.apple.com lookup). Required by
// the library when building a Production SignedDataVerifier; ignored in Sandbox.
const appAppleIdRaw = process.env.APPLE_IAP_APP_APPLE_ID || "6759671005";
const appAppleId = Number.parseInt(appAppleIdRaw, 10);
const iapEnv = process.env.APPLE_IAP_ENVIRONMENT === "Production"
  ? Environment.PRODUCTION
  : Environment.SANDBOX;

if (keyId && issuerId && privateKeyBase64) {
  try {
    const privateKey = Buffer.from(privateKeyBase64, "base64").toString("utf8");

    appleClient = new AppStoreServerAPIClient(
      privateKey,
      keyId,
      issuerId,
      bundleId,
      iapEnv
    );

    // Load Apple root certificates for JWS verification.
    // Try multiple candidate directories so this works in both dev (tsx from
    // src/) and prod (node from dist/). TypeScript compilation does not copy
    // .cer files to dist, so the certs only exist in src/certs/ at runtime.
    const here = path.dirname(new URL(import.meta.url).pathname);
    const candidateDirs = [
      path.join(here, "..", "certs"),                   // dist/services/ -> dist/certs/ (if copied)
      path.join(here, "..", "..", "src", "certs"),      // dist/services/ -> src/certs/ (prod)
      path.join(here, "..", "..", "..", "src", "certs"), // fallback
    ];
    let certsDir: string | null = null;
    for (const dir of candidateDirs) {
      if (fs.existsSync(dir)) {
        certsDir = dir;
        break;
      }
    }
    let rootCerts: Buffer[] = [];
    if (certsDir) {
      rootCerts = fs
        .readdirSync(certsDir)
        .filter((f) => f.endsWith(".cer") || f.endsWith(".pem"))
        .map((f) => fs.readFileSync(path.join(certsDir!, f)));
    }
    if (rootCerts.length === 0) {
      console.warn("WARNING: No Apple root certificates found in any of:", candidateDirs, "- webhook verification will fail");
    }

    signedDataVerifierSandbox = new SignedDataVerifier(
      rootCerts,
      true, // enable online checks
      Environment.SANDBOX,
      bundleId
    );
    signedDataVerifierProduction = new SignedDataVerifier(
      rootCerts,
      true,
      Environment.PRODUCTION,
      bundleId,
      Number.isFinite(appAppleId) ? appAppleId : undefined
    );
    signedDataVerifier =
      iapEnv === Environment.PRODUCTION
        ? signedDataVerifierProduction
        : signedDataVerifierSandbox;

    console.log(`Apple IAP configured successfully (${rootCerts.length} root cert(s) loaded)`);
  } catch (err) {
    console.error("Failed to initialize Apple IAP client:", err);
    appleClient = null;
    signedDataVerifier = null;
    signedDataVerifierSandbox = null;
    signedDataVerifierProduction = null;
  }
} else {
  console.warn(
    "APPLE_IAP_KEY_ID / APPLE_IAP_ISSUER_ID / APPLE_IAP_PRIVATE_KEY not set — Apple IAP disabled"
  );
}

export function getAppleClient(): AppStoreServerAPIClient | null {
  return appleClient;
}

export function getSignedDataVerifier(): SignedDataVerifier | null {
  return signedDataVerifier;
}

type DecodedNotification = {
  notificationType: string;
  subtype?: string;
  transactionInfo: JWSTransactionDecodedPayload | null;
  renewalInfo: JWSRenewalInfoDecodedPayload | null;
};

async function decodeWithVerifier(
  verifier: SignedDataVerifier,
  signedPayload: string
): Promise<DecodedNotification | null> {
  const notification = await verifier.verifyAndDecodeNotification(signedPayload);
  const data = notification.data;
  if (!data) return null;

  let transactionInfo: JWSTransactionDecodedPayload | null = null;
  let renewalInfo: JWSRenewalInfoDecodedPayload | null = null;

  if (data.signedTransactionInfo) {
    transactionInfo = await verifier.verifyAndDecodeTransaction(
      data.signedTransactionInfo
    );
  }
  if (data.signedRenewalInfo) {
    renewalInfo = await verifier.verifyAndDecodeRenewalInfo(data.signedRenewalInfo);
  }

  return {
    notificationType: notification.notificationType ?? "",
    subtype: notification.subtype ?? undefined,
    transactionInfo,
    renewalInfo,
  };
}

function enrichVerificationError(err: unknown): Error {
  // Surface the real VerificationStatus so the Ops panel / webhook log
  // stores something actionable instead of the generic "returned null".
  // VerificationException extends Error but super() is called without a
  // message, so err.message is empty and the status enum is the only clue.
  if (err instanceof VerificationException) {
    const statusName =
      VerificationStatus[err.status] ?? `UNKNOWN(${err.status})`;
    const causeDetail =
      err.cause instanceof Error
        ? `: ${err.cause.name}: ${err.cause.message}`
        : err.cause
          ? `: ${String(err.cause)}`
          : "";
    const message = `VerificationException ${statusName}${causeDetail}`;
    console.error("Failed to decode Apple notification:", message, err.cause ?? "");
    const enriched = new Error(message);
    enriched.name = "VerificationException";
    return enriched;
  }
  console.error("Failed to decode Apple notification:", err);
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * Decode a notification payload from Apple App Store Server Notifications v2.
 * Tries the primary-env verifier, then falls back to the other environment
 * if Apple returns INVALID_ENVIRONMENT — TestFlight (Sandbox) and App Store
 * (Production) both post to the same webhook URL.
 */
export async function decodeNotification(
  signedPayload: string
): Promise<DecodedNotification | null> {
  const primary = signedDataVerifier;
  if (!primary) {
    throw new Error("Apple IAP SignedDataVerifier not initialized");
  }
  const fallback =
    primary === signedDataVerifierProduction
      ? signedDataVerifierSandbox
      : signedDataVerifierProduction;

  try {
    return await decodeWithVerifier(primary, signedPayload);
  } catch (err) {
    const isEnvMismatch =
      err instanceof VerificationException &&
      err.status === VerificationStatus.INVALID_ENVIRONMENT;
    if (isEnvMismatch && fallback) {
      try {
        return await decodeWithVerifier(fallback, signedPayload);
      } catch (fallbackErr) {
        throw enrichVerificationError(fallbackErr);
      }
    }
    throw enrichVerificationError(err);
  }
}

/**
 * Check whether a decoded transaction represents an active subscription.
 */
export function isTransactionActive(transaction: JWSTransactionDecodedPayload): boolean {
  // Check for revocation
  if (transaction.revocationDate) return false;

  // Check expiry
  const expiresDate = transaction.expiresDate;
  if (!expiresDate) return false;

  return expiresDate > Date.now();
}

export { PRODUCT_ID_MONTHLY, PRODUCT_ID_ANNUAL, VALID_PRODUCT_IDS, bundleId };
