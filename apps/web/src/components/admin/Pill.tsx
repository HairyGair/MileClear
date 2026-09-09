import type { ReactNode } from "react";
import type { AdminTone } from "./types";

interface PillProps {
  tone?: AdminTone;
  children: ReactNode;
  title?: string;
}

export function Pill({ tone = "neutral", children, title }: PillProps) {
  return (
    <span className={`admin-pill admin-pill--${tone}`} title={title}>
      {children}
    </span>
  );
}

interface DotProps {
  tone?: AdminTone;
  title?: string;
}

export function Dot({ tone = "neutral", title }: DotProps) {
  return <span className={`admin-dot admin-dot--${tone}`} title={title} />;
}
