"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface TabItem {
  id: string;
  label: ReactNode;
  /** Small count shown after the label. */
  count?: number;
  /** Rendered only while the tab is selected, so its data loads on demand. */
  content?: ReactNode;
}

interface TabBarProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Names the tab list for screen readers. */
  label: string;
  size?: "sm" | "md";
  idBase?: string;
}

/** A row of tabs on its own (controlled). Arrow keys move between tabs. */
export function TabBar({ tabs, value, onChange, label, size = "md", idBase }: TabBarProps) {
  const fallbackId = useId();
  const base = idBase ?? fallbackId;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div className={`adm-tabs adm-tabs--${size}`} role="tablist" aria-label={label}>
      {tabs.map((t, i) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            className={`adm-tabs__tab${selected ? " adm-tabs__tab--active" : ""}`}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
            {typeof t.count === "number" && <span className="adm-tabs__count">{t.count.toLocaleString("en-GB")}</span>}
          </button>
        );
      })}
    </div>
  );
}

interface TabsProps {
  tabs: TabItem[];
  label: string;
  /** Uncontrolled start tab; defaults to the first. */
  defaultTab?: string;
  /** Controlled use. */
  value?: string;
  onChange?: (id: string) => void;
  size?: "sm" | "md";
}

/** Tabs with their panels. Only the selected panel is mounted. */
export function Tabs({ tabs, label, defaultTab, value, onChange, size }: TabsProps) {
  const base = useId();
  const [inner, setInner] = useState(defaultTab ?? tabs[0]?.id ?? "");
  const current = value ?? inner;
  const select = (id: string) => {
    if (value === undefined) setInner(id);
    onChange?.(id);
  };
  const active = tabs.find((t) => t.id === current) ?? tabs[0];
  return (
    <div className="adm-tabset">
      <TabBar tabs={tabs} value={active?.id ?? ""} onChange={select} label={label} size={size} idBase={base} />
      {active && (
        <div
          className="adm-tabset__panel"
          role="tabpanel"
          id={`${base}-panel-${active.id}`}
          aria-labelledby={`${base}-tab-${active.id}`}
        >
          {active.content}
        </div>
      )}
    </div>
  );
}
