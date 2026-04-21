import { Platform } from "react-native";
import Constants from "expo-constants";

const PRODUCT_ID_MONTHLY = "com.mileclear.premium.monthly";
const PRODUCT_ID_ANNUAL = "com.mileclear.premium.annual";
const ALL_PRODUCT_IDS = [PRODUCT_ID_MONTHLY, PRODUCT_ID_ANNUAL];

// Detect Expo Go — NitroModules (used by react-native-iap) fatally crashes
// in Expo Go before try/catch can intercept, so we must guard before require().
// Constants.executionEnvironment is unreliable in SDK 53+ (Expo Go reports "storeClient").
// Constants.appOwnership === "expo" is the reliable check for Expo Go.
const isExpoGo = Constants.appOwnership === "expo";
const isNativeBuild = !isExpoGo && Platform.OS === "ios";

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
 * Check if IAP is available (iOS only, native module must be present).
 * Returns false in Expo Go or on Android.
 */
export function isIapAvailable(): boolean {
  if (Platform.OS !== "ios") return false;
  return loadIapModule() !== null;
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
    const products = await iap.fetchProducts({ skus: ALL_PRODUCT_IDS, type: "subs" });
    if (!products) return { monthly: null, annual: null };

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
 * Restore previous purchases. Returns transaction IDs for server validation.
 */
export async function restorePurchases(): Promise<string[]> {
  const iap = loadIapModule();
  if (!iap) return [];
  try {
    const purchases = await iap.getAvailablePurchases();
    if (!purchases) return [];
    return (purchases as Array<{ productId: string; transactionId: string }>)
      .filter((p) => ALL_PRODUCT_IDS.includes(p.productId))
      .map((p) => p.transactionId)
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
      const transactionId = purchase.transactionId;
      if (!transactionId) return;

      try {
        await callbacks.onPurchaseSuccess(transactionId);
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

export { PRODUCT_ID_MONTHLY, PRODUCT_ID_ANNUAL };
