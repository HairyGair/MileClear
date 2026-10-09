"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

interface ToastItem {
  id: number;
  text: string;
  tone: "ok" | "error";
}

interface ToastApi {
  show: (text: string, tone?: "ok" | "error") => void;
}

const ToastContext = createContext<ToastApi>({ show: () => {} });

/** Mounted once by the shell. `useToast().show("Saved")`, `show("Couldn't save. Try again.", "error")`. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const show = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    const id = nextId.current++;
    setItems((prev) => [...prev.slice(-1), { id, text, tone }]);
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), tone === "error" ? 8000 : 4000);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="mc-toasts">
        {items.map((t) => (
          <div key={t.id} className="mc-toast" role={t.tone === "error" ? "alert" : "status"}>
            <Icon
              name={t.tone === "error" ? "alert-circle" : "checkmark-circle"}
              size={18}
              className={t.tone === "error" ? "mc-toast__icon--err" : "mc-toast__icon--ok"}
            />
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
