// Network connectivity detection
// Polls the API health endpoint to determine online/offline status

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3002";
const HEALTH_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 15000;

type ConnectivityListener = (online: boolean) => void;

let cachedOnline = true;
let pollTimer: ReturnType<typeof setInterval> | null = null;
const listeners: Set<ConnectivityListener> = new Set();

export async function checkConnectivity(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

    const res = await fetch(`${API_URL}/health`, {
      method: "HEAD",
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const online = res.ok;

    if (online !== cachedOnline) {
      cachedOnline = online;
      notifyListeners();
    }

    return online;
  } catch {
    if (cachedOnline) {
      cachedOnline = false;
      notifyListeners();
    }
    return false;
  }
}

export function isOnline(): boolean {
  return cachedOnline;
}

export function startNetworkMonitoring(): () => void {
  // Run an initial check
  checkConnectivity();

  // Poll every 15 seconds
  pollTimer = setInterval(checkConnectivity, POLL_INTERVAL_MS);

  return () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };
}

export function onConnectivityChange(listener: ConnectivityListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  for (const listener of listeners) {
    try {
      listener(cachedOnline);
    } catch {
      // Don't let a listener error break others
    }
  }
}
