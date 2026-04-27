// Sync context — provides sync state and pending count to the UI

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { startAutoSync, getSyncStatus, onSyncStateChange, processSyncQueue } from "./index";
import type { SyncState, SyncProgress } from "./index";
import { startNetworkMonitoring } from "../network";

interface SyncContextValue {
  syncState: SyncState;
  pendingCount: number;
  progress: SyncProgress | null;
  triggerSync: () => void;
}

const SyncContext = createContext<SyncContextValue>({
  syncState: "idle",
  pendingCount: 0,
  progress: null,
  triggerSync: () => {},
});

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [pendingCount, setPendingCount] = useState(0);
  const [progress, setProgress] = useState<SyncProgress | null>(null);

  useEffect(() => {
    // Start network monitoring
    const stopNetwork = startNetworkMonitoring();

    // Start auto sync (processes on startup + connectivity changes)
    const stopAutoSync = startAutoSync();

    // Listen for state changes from the sync engine
    const unsubState = onSyncStateChange((state, count, prog) => {
      setSyncState(state);
      setPendingCount(count);
      setProgress(prog);
    });

    // Get initial status
    getSyncStatus().then(({ pendingCount: count }) => {
      setPendingCount(count);
    });

    return () => {
      stopNetwork();
      stopAutoSync();
      unsubState();
    };
  }, []);

  const triggerSync = useCallback(() => {
    processSyncQueue();
  }, []);

  return (
    <SyncContext.Provider value={{ syncState, pendingCount, progress, triggerSync }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}
