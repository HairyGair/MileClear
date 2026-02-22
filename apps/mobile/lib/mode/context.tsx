import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getAppMode, setAppMode as persistMode, type AppMode } from "./index";

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

  useEffect(() => {
    getAppMode().then(setModeState).catch(() => {});
  }, []);

  const setMode = useCallback((newMode: AppMode) => {
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
