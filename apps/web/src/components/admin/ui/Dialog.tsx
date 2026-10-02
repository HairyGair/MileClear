"use client";

// A modal dialog for admin pages. Rendered into the .adm root through a
// portal: panels use backdrop-filter, which would otherwise trap a fixed
// overlay inside the panel.

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AdminIcon } from "./icons";
import "./forms.css";

interface DialogProps {
  open: boolean;
  /** Called for Escape, the close button and a click outside. Ignored while
   *  `busy`, so a running action cannot be dismissed half way. */
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Red edge: the confirm step for something that cannot be undone. */
  danger?: boolean;
  busy?: boolean;
}

export function Dialog({ open, onClose, title, children, footer, wide, danger, busy }: DialogProps) {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<Element | null>(null);

  useEffect(() => {
    setHost(document.querySelector(".adm") ?? document.body);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus the first control so keyboard users land inside the dialog.
    const t = setTimeout(() => {
      const first = boxRef.current?.querySelector<HTMLElement>("input, textarea, select, button:not([data-dialog-close])");
      (first ?? boxRef.current)?.focus();
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open, busy, onClose]);

  if (!open || !host) return null;

  return createPortal(
    <div
      className="adm-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={boxRef}
        className={`adm-dialog${wide ? " adm-dialog--wide" : ""}${danger ? " adm-dialog--danger" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy || undefined}
        tabIndex={-1}
      >
        <div className="adm-dialog__head">
          <h2 className="adm-dialog__title" id={titleId}>
            {title}
          </h2>
          <button type="button" className="adm-iconbtn" data-dialog-close onClick={onClose} disabled={busy} aria-label="Close">
            <AdminIcon name="close" size={16} />
          </button>
        </div>
        <div className="adm-dialog__body">{children}</div>
        {footer && <div className="adm-dialog__foot">{footer}</div>}
      </div>
    </div>,
    host
  );
}
