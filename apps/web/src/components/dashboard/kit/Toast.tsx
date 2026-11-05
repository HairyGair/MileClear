"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

const LIFETIME = { ok: 5000, error: 10000 } as const;

/** One toast. Its dismiss timer pauses while the pointer is over it or focus is inside it. */
function ToastView({ item, onDone }: { item: ToastItem; onDone: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const left = useRef<number>(LIFETIME[item.tone]);
  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const t = window.setTimeout(() => onDone(item.id), left.current);
    return () => {
      window.clearTimeout(t);
      left.current = Math.max(1000, left.current - (Date.now() - started));
    };
  }, [paused, item.id, onDone]);
  return (
    <div
      className="mc-toast"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon
        name={item.tone === "error" ? "alert-circle" : "checkmark-circle"}
        size={18}
        className={item.tone === "error" ? "mc-toast__icon--err" : "mc-toast__icon--ok"}
      />
      <span className="mc-toast__text">{item.text}</span>
      <button type="button" className="mc-toast__close" aria-label="Dismiss message" onClick={() => onDone(item.id)}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

/** Mounted once by the shell. `useToast().show("Saved")`, `show("Couldn't save. Try again.", "error")`. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const show = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    const id = nextId.current++;
    setItems((prev) => [...prev.slice(-1), { id, text, tone }]);
  }, []);
  const done = useCallback((id: number) => setItems((prev) => prev.filter((t) => t.id !== id)), []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* The two live regions are always in the page, so screen readers are
          already listening when a message is inserted. */}
      <div className="mc-toasts">
        <div className="mc-toasts__live" role="status" aria-live="polite">
          {items.filter((t) => t.tone === "ok").map((t) => (
            <ToastView key={t.id} item={t} onDone={done} />
          ))}
        </div>
        <div className="mc-toasts__live" role="alert" aria-live="assertive">
          {items.filter((t) => t.tone === "error").map((t) => (
            <ToastView key={t.id} item={t} onDone={done} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
