import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { AppState } from "react-native";
import { getAppMode, setAppMode as persistMode, type AppMode } from "./index";
import { isWithinSchedule, getScheduleSetting } from "../schedule/index";

interface ModeContextValue {
  mode: AppMode;
  isPersonal: boolean;
  isWork: boolean;
  toggleMode: () => void;
  setMode: (mode: AppMode) => void;
}

const ModeContext = createContext<ModeContextValue | null>(null);

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AppMode>("work");

  // Manual override flag — when user manually toggles, skip auto-switch until next app foreground
  const manualOverride = useRef(false);

  useEffect(() => {
    getAppMode().then(setModeState).catch(() => {});
  }, []);

  // Auto-switch mode based on work schedule (opt-in)
  useEffect(() => {
    async function checkScheduleMode() {
      if (manualOverride.current) return;
      const autoMode = await getScheduleSetting("schedule_auto_mode");
      if (!autoMode) return;

      const slot = await isWithinSchedule();
      const target: AppMode = slot ? "work" : "personal";
      setModeState((current) => {
        if (current !== target) {
          persistMode(target).catch(() => {});
          return target;
        }
        return current;
      });
    }

    checkScheduleMode();

    // Re-check when app comes to foreground
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        manualOverride.current = false;
        checkScheduleMode();
      }
    });

    // Check periodically (every 5 minutes)
    const interval = setInterval(checkScheduleMode, 5 * 60 * 1000);

    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, []);

  const setMode = useCallback((newMode: AppMode) => {
    manualOverride.current = true; // User is manually switching
    setModeState(newMode);
    persistMode(newMode).catch(() => {});
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === "work" ? "personal" : "work");
  }, [mode, setMode]);

  return (
    <ModeContext.Provider
      value={{
        mode,
        isPersonal: mode === "personal",
        isWork: mode === "work",
        toggleMode,
        setMode,
      }}
    >
      {children}
    </ModeContext.Provider>
  );
}

export function useMode(): ModeContextValue {
  const context = useContext(ModeContext);
  if (!context) {
    throw new Error("useMode must be used within a ModeProvider");
  }
  return context;
}
