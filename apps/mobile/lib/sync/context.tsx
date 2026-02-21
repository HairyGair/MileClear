// Sync context — provides sync state and pending count to the UI

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { startAutoSync, getSyncStatus, onSyncStateChange, processSyncQueue } from "./index";
import type { SyncState } from "./index";
import { startNetworkMonitoring } from "../network";

interface SyncContextValue {
  syncState: SyncState;
  pendingCount: number;
  triggerSync: () => void;
}

const SyncContext = createContext<SyncContextValue>({
  syncState: "idle",
  pendingCount: 0,
  triggerSync: () => {},
});

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    // Start network monitoring
    const stopNetwork = startNetworkMonitoring();

    // Start auto sync (processes on startup + connectivity changes)
    const stopAutoSync = startAutoSync();

    // Listen for state changes from the sync engine
    const unsubState = onSyncStateChange((state, count) => {
      setSyncState(state);
      setPendingCount(count);
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
    <SyncContext.Provider value={{ syncState, pendingCount, triggerSync }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}
