// Optional Face ID / Touch ID / device-passcode lock that gates the app UI.
//
// SAFETY: the native module is loaded via lazy require() in a try/catch so an
// accidental OTA to a binary that predates the dependency degrades gracefully
// (available=false → the app simply never locks) instead of crashing. The lock
// covers the UI only — it must NEVER block the module-scope native tracking
// engine boot, which runs before React mounts, so drives keep capturing while
// the screen is locked.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import {
  getAppLockConfig,
  setAppLockConfig,
  type AppLockConfig,
} from "./preferences";

type LockType = "face" | "fingerprint" | "passcode" | null;

interface LocalAuthModule {
  hasHardwareAsync: () => Promise<boolean>;
  isEnrolledAsync: () => Promise<boolean>;
  supportedAuthenticationTypesAsync: () => Promise<number[]>;
  authenticateAsync: (opts: {
    promptMessage?: string;
    cancelLabel?: string;
    disableDeviceFallback?: boolean;
    fallbackLabel?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  // AuthenticationType: FINGERPRINT = 1, FACIAL_RECOGNITION = 2, IRIS = 3
}

let localAuth: LocalAuthModule | null = null;
let loadAttempted = false;
function getLocalAuth(): LocalAuthModule | null {
  if (loadAttempted) return localAuth;
  loadAttempted = true;
  try {
    localAuth = require("expo-local-authentication") as LocalAuthModule;
  } catch {
    localAuth = null; // binary predates the dependency (old OTA target)
  }
  return localAuth;
}

interface AppLockContextValue {
  isLocked: boolean;
  isLockRequired: boolean;
  available: boolean;
  lockType: LockType;
  authenticate: () => Promise<boolean>;
  setEnabled: (enabled: boolean) => Promise<boolean>;
  setRequireAfterMs: (ms: number) => Promise<void>;
  config: AppLockConfig;
}

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function useAppLock(): AppLockContextValue {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error("useAppLock must be used within AppLockProvider");
  return ctx;
}

/** Is biometric/passcode auth actually usable on this device right now? */
async function probeCapability(): Promise<{ available: boolean; lockType: LockType }> {
  const la = getLocalAuth();
  if (!la) return { available: false, lockType: null };
  try {
    const hasHardware = await la.hasHardwareAsync();
    const enrolled = await la.isEnrolledAsync();
    if (!hasHardware || !enrolled) return { available: false, lockType: null };
    const types = await la.supportedAuthenticationTypesAsync();
    const lockType: LockType = types.includes(2)
      ? "face"
      : types.includes(1)
        ? "fingerprint"
        : "passcode";
    return { available: true, lockType };
  } catch {
    return { available: false, lockType: null };
  }
}

export function AppLockProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppLockConfig>({ enabled: false, requireAfterMs: 0 });
  const [available, setAvailable] = useState(false);
  const [lockType, setLockType] = useState<LockType>(null);
  // Start locked if the saved config says so — decided after the initial load.
  const [isLocked, setIsLocked] = useState(false);
  const backgroundedAt = useRef<number>(0);
  const authInFlight = useRef(false);

  // Initial load: read config + probe capability, then lock if required.
  useEffect(() => {
    (async () => {
      const [cfg, cap] = await Promise.all([getAppLockConfig(), probeCapability()]);
      setConfig(cfg);
      setAvailable(cap.available);
      setLockType(cap.lockType);
      if (cfg.enabled && cap.available) setIsLocked(true);
    })();
  }, []);

  const authenticate = useCallback(async (): Promise<boolean> => {
    const la = getLocalAuth();
    if (!la) {
      // Module unavailable — never trap the user out of their own app.
      setIsLocked(false);
      return true;
    }
    if (authInFlight.current) return false;
    authInFlight.current = true;
    try {
      const res = await la.authenticateAsync({
        promptMessage: "Unlock MileClear",
        cancelLabel: "Cancel",
        disableDeviceFallback: false, // allow device passcode if biometrics fail
        fallbackLabel: "Use passcode",
      });
      if (res.success) {
        setIsLocked(false);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      authInFlight.current = false;
    }
  }, []);

  // Re-lock when the app returns to the foreground after being away longer than
  // requireAfterMs. Stamps the leave time on background/inactive.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        backgroundedAt.current = Date.now();
        return;
      }
      if (state === "active") {
        if (!config.enabled || !available || isLocked) return;
        const away = Date.now() - backgroundedAt.current;
        if (backgroundedAt.current > 0 && away >= config.requireAfterMs) {
          setIsLocked(true);
        }
      }
    });
    return () => sub.remove();
  }, [config.enabled, config.requireAfterMs, available, isLocked]);

  // Enable/disable from settings. Enabling requires a successful auth first (so
  // a user can't lock themselves out without proving they can get back in).
  const setEnabled = useCallback(
    async (enabled: boolean): Promise<boolean> => {
      if (enabled) {
        const cap = await probeCapability();
        setAvailable(cap.available);
        setLockType(cap.lockType);
        if (!cap.available) return false;
        const ok = await authenticate();
        if (!ok) return false;
      }
      await setAppLockConfig({ enabled });
      setConfig((c) => ({ ...c, enabled }));
      if (!enabled) setIsLocked(false);
      return true;
    },
    [authenticate]
  );

  const setRequireAfterMs = useCallback(async (ms: number): Promise<void> => {
    await setAppLockConfig({ requireAfterMs: ms });
    setConfig((c) => ({ ...c, requireAfterMs: ms }));
  }, []);

  return (
    <AppLockContext.Provider
      value={{
        isLocked,
        isLockRequired: config.enabled,
        available,
        lockType,
        authenticate,
        setEnabled,
        setRequireAfterMs,
        config,
      }}
    >
      {children}
    </AppLockContext.Provider>
  );
}
