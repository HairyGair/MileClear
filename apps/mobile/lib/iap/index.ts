import { Platform } from "react-native";
import Constants from "expo-constants";

const PRODUCT_ID_MONTHLY = "com.mileclear.premium.monthly";
const PRODUCT_ID_ANNUAL = "com.mileclear.premium.annual";
const ALL_PRODUCT_IDS = [PRODUCT_ID_MONTHLY, PRODUCT_ID_ANNUAL];

// Google Play models a subscription as ONE product with several base plans,
// where the App Store uses a separate product per duration. So Android buys
// SKU "premium" and selects the monthly or annual base plan via its offer
// token, rather than picking one of two SKUs.
const ANDROID_SUBSCRIPTION_SKU = "premium";
const ANDROID_BASE_PLAN_MONTHLY = "monthly";
const ANDROID_BASE_PLAN_ANNUAL = "annual";

const isAndroid = Platform.OS === "android";

/** SKUs to query, per platform. */
function productIdsForPlatform(): string[] {
  return isAndroid ? [ANDROID_SUBSCRIPTION_SKU] : ALL_PRODUCT_IDS;
}

function androidBasePlanFor(plan: "monthly" | "annual"): string {
  return plan === "annual" ? ANDROID_BASE_PLAN_ANNUAL : ANDROID_BASE_PLAN_MONTHLY;
}

// Detect Expo Go — NitroModules (used by react-native-iap) fatally crashes
// in Expo Go before try/catch can intercept, so we must guard before require().
// Constants.executionEnvironment is unreliable in SDK 53+ (Expo Go reports "storeClient").
// Constants.appOwnership === "expo" is the reliable check for Expo Go.
const isExpoGo = Constants.appOwnership === "expo";
const isNativeBuild = !isExpoGo && (Platform.OS === "ios" || Platform.OS === "android");

// Lazy import for Expo Go compatibility (native module may not be available)
let RNIap: typeof import("react-native-iap") | null = null;

function loadIapModule(): typeof import("react-native-iap") | null {
  if (RNIap) return RNIap;
  if (!isNativeBuild) return null;
  try {
    RNIap = require("react-native-iap");
    return RNIap;
  } catch {
    return null;
  }
}

/**
 * Check if IAP is available (iOS or Android, native module must be present).
 * Returns false in Expo Go and on web.
 */
export function isIapAvailable(): boolean {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return false;
  return loadIapModule() !== null;
}

/**
 * Whether the app may hand the user off to Stripe Checkout in a browser.
 * Google Play's payments policy forbids steering to an external payment page
 * for digital goods, so a native Android build must never open Stripe even
 * when Play Billing is unavailable. iOS, Expo Go and dev builds keep the
 * fallback.
 */
export function externalCheckoutAllowed(): boolean {
  if (isAndroid && isNativeBuild) return false;
  return true;
}

/**
 * Copy shown in place of the Stripe fallback when external checkout is not
 * allowed and the store is unavailable. Deliberately a plain statement with
 * no link: opening the website from here would still count as steering.
 */
export const EXTERNAL_CHECKOUT_BLOCKED_TITLE = "Google Play Billing is not available";
export const EXTERNAL_CHECKOUT_BLOCKED_MESSAGE =
  "Google Play Billing is not available on this device. Pro can be bought on the website at mileclear.com and works on every device.";

/** Deep link to Google Play's subscription management for our Pro SKU. */
export const PLAY_SUBSCRIPTIONS_URL =
  "https://play.google.com/store/account/subscriptions?sku=premium&package=com.mileclear.app";

/** Which store backs the current platform — decides the validate endpoint. */
export function iapStore(): "apple" | "google" | null {
  if (!isIapAvailable()) return null;
  return isAndroid ? "google" : "apple";
}

/**
 * Initialize IAP connection. Must be called before any purchases.
 */
export async function initializeIap(): Promise<boolean> {
  const iap = loadIapModule();
  if (!iap) return false;
  try {
    await iap.initConnection();
    return true;
  } catch (err) {
    console.warn("IAP initConnection failed:", err);
    return false;
  }
}

export interface SubscriptionProduct {
  productId: string;
  localizedPrice: string;
  currency: string;
}

/**
 * Fetch the monthly subscription product details from App Store.
 * Returns null if product not found or IAP unavailable.
 */
export async function getSubscriptionProduct(): Promise<SubscriptionProduct | null> {
  const products = await getSubscriptionProducts();
  return products.monthly;
}

/**
 * Fetch both subscription product details from App Store.
 * Returns localized prices for monthly and annual plans.
 */
export async function getSubscriptionProducts(): Promise<{
  monthly: SubscriptionProduct | null;
  annual: SubscriptionProduct | null;
}> {
  const iap = loadIapModule();
  if (!iap) return { monthly: null, annual: null };
  try {
    const products = await iap.fetchProducts({
      skus: productIdsForPlatform(),
      type: "subs",
    });
    if (!products) return { monthly: null, annual: null };

    if (isAndroid) {
      // One Play product, priced per base plan. Cache the offer tokens while
      // we're here: purchaseSubscription needs them and re-fetching at the
      // moment the user taps Subscribe adds a visible delay.
      const product = products.find((p) => p.id === ANDROID_SUBSCRIPTION_SKU);
      const offers = product?.subscriptionOffers || [];
      for (const offer of offers) {
        if (offer.basePlanIdAndroid && offer.offerTokenAndroid) {
          androidOfferTokens.set(offer.basePlanIdAndroid, offer.offerTokenAndroid);
        }
      }

      const toAndroidProduct = (basePlanId: string): SubscriptionProduct | null => {
        const offer = offers.find((o) => o.basePlanIdAndroid === basePlanId);
        if (!offer || !product) return null;
        return {
          productId: product.id,
          localizedPrice: offer.displayPrice,
          currency: offer.currency || product.currency,
        };
      };

      return {
        monthly: toAndroidProduct(ANDROID_BASE_PLAN_MONTHLY),
        annual: toAndroidProduct(ANDROID_BASE_PLAN_ANNUAL),
      };
    }

    const toProduct = (id: string): SubscriptionProduct | null => {
      const p = products.find((prod) => prod.id === id);
      if (!p) return null;
      return { productId: p.id, localizedPrice: p.displayPrice, currency: p.currency };
    };

    return {
      monthly: toProduct(PRODUCT_ID_MONTHLY),
      annual: toProduct(PRODUCT_ID_ANNUAL),
    };
  } catch (err) {
    console.warn("Failed to fetch subscription products:", err);
    return { monthly: null, annual: null };
  }
}

/** basePlanId -> offerToken, populated by getSubscriptionProducts. */
const androidOfferTokens = new Map<string, string>();

/** Resolve an Android offer token, fetching products first if needed. */
async function getAndroidOfferToken(basePlanId: string): Promise<string | null> {
  const cached = androidOfferTokens.get(basePlanId);
  if (cached) return cached;
  await getSubscriptionProducts();
  return androidOfferTokens.get(basePlanId) ?? null;
}

/**
 * Trigger the StoreKit purchase sheet for a subscription.
 * @param plan - "monthly" or "annual" (defaults to "monthly")
 * @param userId - the MileClear user id, sent as appAccountToken so the
 *   server-to-server webhook can be linked back to the account even if
 *   /billing/apple/validate doesn't complete (e.g. network blip, app crash).
 *   Must be a UUID - StoreKit rejects non-UUID values. Ignored if omitted.
 */
export async function purchaseSubscription(
  plan: "monthly" | "annual" = "monthly",
  userId?: string
): Promise<void> {
  const iap = loadIapModule();
  if (!iap) throw new Error("IAP not available");

  if (isAndroid) {
    // Play needs the offer token for the base plan being bought; without it
    // the sheet either fails or silently picks an arbitrary offer.
    const basePlanId = androidBasePlanFor(plan);
    const offerToken = await getAndroidOfferToken(basePlanId);
    if (!offerToken) {
      throw new Error(`No Play offer available for the ${plan} plan`);
    }
    await iap.requestPurchase({
      type: "subs",
      request: {
        android: {
          skus: [ANDROID_SUBSCRIPTION_SKU],
          subscriptionOffers: [{ sku: ANDROID_SUBSCRIPTION_SKU, offerToken }],
          // Android's analogue of appAccountToken: lets an RTDN be traced
          // back to the account even if /validate never completes.
          ...(userId && isUuid(userId) ? { obfuscatedAccountId: userId } : {}),
        },
      },
    });
    return;
  }

  const sku = plan === "annual" ? PRODUCT_ID_ANNUAL : PRODUCT_ID_MONTHLY;
  const appleRequest: { sku: string; appAccountToken?: string } = { sku };
  if (userId && isUuid(userId)) {
    appleRequest.appAccountToken = userId;
  }
  await iap.requestPurchase({
    type: "subs",
    request: { apple: appleRequest },
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Restore previous purchases. Returns the tokens the server needs to validate:
 * transaction IDs on iOS, purchase tokens on Android. Callers pass these to
 * whichever validate endpoint matches iapStore().
 */
export async function restorePurchases(): Promise<string[]> {
  const iap = loadIapModule();
  if (!iap) return [];
  try {
    const purchases = await iap.getAvailablePurchases();
    if (!purchases) return [];

    const validIds = productIdsForPlatform();
    return (
      purchases as Array<{
        productId: string;
        transactionId?: string;
        purchaseToken?: string | null;
      }>
    )
      .filter((p) => validIds.includes(p.productId))
      .map((p) => (isAndroid ? p.purchaseToken : p.transactionId))
      .filter((id): id is string => !!id);
  } catch (err) {
    console.warn("Failed to restore purchases:", err);
    return [];
  }
}

/**
 * Set up global purchase listeners. Returns a cleanup function.
 * CRITICAL: finishTransaction() is only called after server validation succeeds.
 */
export function setupPurchaseListeners(callbacks: {
  onPurchaseSuccess: (transactionId: string) => Promise<void>;
  onPurchaseError: (error: { code?: string; message?: string }) => void;
}): () => void {
  const iap = loadIapModule();
  if (!iap) return () => {};

  const purchaseUpdateSubscription = iap.purchaseUpdatedListener(
    async (purchase) => {
      // iOS validates by transaction ID, Play by purchase token. The callback
      // receives whichever the current store needs; the caller picks the
      // matching validate endpoint from iapStore().
      const token = isAndroid ? purchase.purchaseToken : purchase.transactionId;
      if (!token) return;

      try {
        await callbacks.onPurchaseSuccess(token);
        // Only finish after server confirms — if we don't call this,
        // StoreKit will re-deliver on next app launch
        await iap.finishTransaction({ purchase, isConsumable: false });
      } catch (err) {
        console.error("Purchase processing failed:", err);
        // Don't finish the transaction — StoreKit will retry
      }
    }
  );

  const purchaseErrorSubscription = iap.purchaseErrorListener((error) => {
    // Don't alert on user cancellation
    if (error.code === "user-cancelled") return;
    callbacks.onPurchaseError({
      code: error.code,
      message: error.message,
    });
  });

  return () => {
    purchaseUpdateSubscription.remove();
    purchaseErrorSubscription.remove();
  };
}

/**
 * End IAP connection. Call on cleanup.
 */
export async function endIapConnection(): Promise<void> {
  const iap = loadIapModule();
  if (!iap) return;
  try {
    await iap.endConnection();
  } catch {
    // Ignore cleanup errors
  }
}

export {
  PRODUCT_ID_MONTHLY,
  PRODUCT_ID_ANNUAL,
  ANDROID_SUBSCRIPTION_SKU,
  ANDROID_BASE_PLAN_MONTHLY,
  ANDROID_BASE_PLAN_ANNUAL,
};
