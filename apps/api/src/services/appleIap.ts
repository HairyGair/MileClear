import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  JWSTransactionDecodedPayload,
  JWSRenewalInfoDecodedPayload,
} from "@apple/app-store-server-library";
import * as fs from "fs";
import * as path from "path";

const PRODUCT_ID_MONTHLY = "com.mileclear.premium.monthly";
const PRODUCT_ID_ANNUAL = "com.mileclear.premium.annual";
const VALID_PRODUCT_IDS = [PRODUCT_ID_MONTHLY, PRODUCT_ID_ANNUAL];

// --- Singleton client (null if not configured, same pattern as lib/stripe.ts) ---

let appleClient: AppStoreServerAPIClient | null = null;
let signedDataVerifier: SignedDataVerifier | null = null;

const keyId = process.env.APPLE_IAP_KEY_ID;
const issuerId = process.env.APPLE_IAP_ISSUER_ID;
const privateKeyBase64 = process.env.APPLE_IAP_PRIVATE_KEY;
const bundleId = process.env.APPLE_IAP_BUNDLE_ID || "com.mileclear.app";
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

    // Load Apple root certificates for JWS verification
    const certsDir = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      "..",
      "certs"
    );
    let rootCerts: Buffer[] = [];
    if (fs.existsSync(certsDir)) {
      rootCerts = fs
        .readdirSync(certsDir)
        .filter((f) => f.endsWith(".cer") || f.endsWith(".pem"))
        .map((f) => fs.readFileSync(path.join(certsDir, f)));
    }
    if (rootCerts.length === 0) {
      console.warn("WARNING: No Apple root certificates found in", certsDir, "- webhook verification will fail");
    }

    signedDataVerifier = new SignedDataVerifier(
      rootCerts,
      true, // enable online checks
      iapEnv,
      bundleId
    );

    console.log(`Apple IAP configured successfully (${rootCerts.length} root cert(s) loaded)`);
  } catch (err) {
    console.error("Failed to initialize Apple IAP client:", err);
    appleClient = null;
    signedDataVerifier = null;
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

/**
 * Decode a notification payload from Apple App Store Server Notifications v2.
 * Returns the decoded notification data.
 */
export async function decodeNotification(signedPayload: string): Promise<{
  notificationType: string;
  subtype?: string;
  transactionInfo: JWSTransactionDecodedPayload | null;
  renewalInfo: JWSRenewalInfoDecodedPayload | null;
} | null> {
  if (!signedDataVerifier) return null;
  try {
    const notification = await signedDataVerifier.verifyAndDecodeNotification(signedPayload);
    const data = notification.data;
    if (!data) return null;

    let transactionInfo: JWSTransactionDecodedPayload | null = null;
    let renewalInfo: JWSRenewalInfoDecodedPayload | null = null;

    if (data.signedTransactionInfo) {
      transactionInfo = await signedDataVerifier.verifyAndDecodeTransaction(
        data.signedTransactionInfo
      );
    }
    if (data.signedRenewalInfo) {
      renewalInfo = await signedDataVerifier.verifyAndDecodeRenewalInfo(
        data.signedRenewalInfo
      );
    }

    return {
      notificationType: notification.notificationType ?? "",
      subtype: notification.subtype ?? undefined,
      transactionInfo,
      renewalInfo,
    };
  } catch (err) {
    console.error("Failed to decode Apple notification:", err);
    return null;
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
