"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { cx } from "./cx";
import { lockScroll, unlockScroll } from "./scrollLock";

/**
 * Modal built on the native <dialog> (focus trap, Esc and inert background for
 * free). A centred dialog from 768px, a bottom sheet below.
 *
 *   <Dialog open={open} title="Add expense" onClose={() => setOpen(false)} footer={<Button variant="primary">Save</Button>}>...</Dialog>
 */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      lockScroll();
    }
    if (!open && d.open) d.close();
    return () => {
      unlockScroll();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={cx("mc-dialog", `mc-dialog--${size}`)}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={() => {
        unlockScroll();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="mc-dialog__panel">
          <span className="mc-dialog__grab" aria-hidden="true" />
          <div className="mc-dialog__head">
            <h2 className="mc-dialog__title">{title}</h2>
            <button type="button" className="mc-iconbtn" aria-label="Close" onClick={onClose}>
              <Icon name="close" size={20} />
            </button>
          </div>
          <div className="mc-dialog__body">{children}</div>
          {footer && <div className="mc-dialog__foot">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/** Yes/no question. Focus starts on Cancel. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  destructive,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't do that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      title={title}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} autoFocus>
            Cancel
          </Button>
          <Button variant={destructive ? "destructive" : "primary"} loading={busy} onClick={go}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {body && <p className="mc-dialog__text">{body}</p>}
      {error && <p className="mc-field__error" role="alert">{error}</p>}
    </Dialog>
  );
}
