"use client";

import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ProChip } from "./Pro";
import { cx } from "./cx";

export interface MenuItem {
  label: string;
  href?: string;
  external?: boolean;
  onClick?: () => void;
  danger?: boolean;
  badge?: "pro";
}

/**
 * Popover menu. Esc closes and returns focus, arrows move, Tab stays inside.
 *
 *   <Menu ariaLabel="More" trigger={<Icon name="ellipsis-horizontal" />} items={[{ label: "Delete", danger: true, onClick }]} />
 */
export function Menu({
  trigger,
  items,
  ariaLabel,
  header,
  align = "right",
  triggerClassName,
}: {
  trigger: ReactNode;
  items: MenuItem[];
  ariaLabel: string;
  header?: ReactNode;
  align?: "left" | "right";
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  const pop = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ up: boolean; maxH?: number }>({ up: false });

  // Keep the popover inside the viewport: flip upward when there is more room
  // above, and cap the height (the menu scrolls) when neither side fits it.
  useLayoutEffect(() => {
    if (!open) return;
    const p = pop.current;
    const b = btn.current;
    if (!p || !b) return;
    const margin = 12;
    const gap = 8;
    const h = p.scrollHeight + 2;
    const r = b.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - gap - margin;
    const above = r.top - gap - margin;
    const up = h > below && above > below;
    const room = up ? above : below;
    setPlace({ up, maxH: h > room ? Math.max(120, room) : undefined });
  }, [open]);

  const focusables = () =>
    Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  useEffect(() => {
    if (!open) return;
    focusables()[0]?.focus();
    function onDoc(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) btn.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!open) return;
    const els = focusables();
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      els[(i + 1) % els.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      els[(i - 1 + els.length) % els.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      els[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      els[els.length - 1]?.focus();
    } else if (e.key === "Tab") {
      e.preventDefault();
      const n = e.shiftKey ? (i - 1 + els.length) % els.length : (i + 1) % els.length;
      els[n]?.focus();
    }
  }

  return (
    <div className="mc-menu" ref={wrap} onKeyDown={onKeyDown}>
      <button
        ref={btn}
        type="button"
        className={cx("mc-menu__trigger", triggerClassName)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={id}
          ref={pop}
          role="menu"
          aria-label={ariaLabel}
          className={cx("mc-menu__pop", align === "left" && "is-left", place.up && "is-up")}
          style={place.maxH ? { maxHeight: place.maxH, overflowY: "auto" } : undefined}
        >
          {header && <div className="mc-menu__head">{header}</div>}
          {items.map((it) => {
            const cls = cx("mc-menu__item", it.danger && "is-danger");
            const inner = (
              <>
                {it.label}
                {it.badge === "pro" && <ProChip />}
              </>
            );
            if (it.href && it.external) {
              return (
                <a key={it.label} role="menuitem" className={cls} href={it.href} target="_blank" rel="noopener noreferrer" onClick={() => close(false)}>
                  {inner}
                </a>
              );
            }
            if (it.href) {
              return (
                <Link key={it.label} role="menuitem" className={cls} href={it.href} onClick={() => close(false)}>
                  {inner}
                </Link>
              );
            }
            return (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className={cls}
                onClick={() => {
                  close(false);
                  it.onClick?.();
                }}
              >
                {inner}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
