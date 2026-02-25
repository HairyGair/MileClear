import type { CSSProperties, ReactNode } from "react";

interface CardProps {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  glow?: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Card({ title, subtitle, action, glow, children, className = "", style }: CardProps) {
  return (
    <div className={`card ${glow ? "card--glow" : ""} ${className}`} style={style}>
      {(title || action) && (
        <div className="card__header">
          <div>
            {title && <h3 className="card__title">{title}</h3>}
            {subtitle && <p className="card__subtitle">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
