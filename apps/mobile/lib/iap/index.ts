import { Platform } from "react-native";
import Constants from "expo-constants";

const PRODUCT_ID = "com.mileclear.premium.monthly";

// Detect Expo Go — NitroModules (used by react-native-iap) fatally crashes
// in Expo Go before try/catch can intercept, so we must guard before require()
const isExpoGo = Constants.executionEnvironment === "storeClient";

// Lazy import for Expo Go compatibility (native module may not be available)
let RNIap: typeof import("react-native-iap") | null = null;

function loadIapModule(): typeof import("react-native-iap") | null {
  if (RNIap) return RNIap;
  if (isExpoGo) return null;
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

/**
 * Fetch the subscription product details from App Store.
 * Returns null if product not found or IAP unavailable.
 */
export async function getSubscriptionProduct(): Promise<{
  productId: string;
  localizedPrice: string;
  currency: string;
} | null> {
  const iap = loadIapModule();
  if (!iap) return null;
  try {
    const products = await iap.fetchProducts({ skus: [PRODUCT_ID], type: "subs" });
    if (!products) return null;
    const product = products.find((p) => p.id === PRODUCT_ID);
    if (!product) return null;
    return {
      productId: product.id,
      localizedPrice: product.displayPrice,
      currency: product.currency,
    };
  } catch (err) {
    console.warn("Failed to fetch subscription product:", err);
    return null;
  }
}

/**
 * Trigger the StoreKit purchase sheet for the monthly subscription.
 */
export async function purchaseSubscription(): Promise<void> {
  const iap = loadIapModule();
  if (!iap) throw new Error("IAP not available");
  await iap.requestPurchase({
    type: "subs",
    request: { apple: { sku: PRODUCT_ID } },
  });
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
      .filter((p) => p.productId === PRODUCT_ID)
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

export { PRODUCT_ID };
