import type { ReactNode } from "react";

interface SectionProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

// Titled card wrapper. Replaces the ad-hoc `const card / h2 / sub`
// inline-style objects the old admin sub-pages each defined for themselves
// (e.g. apps/web/src/app/dashboard/admin/activation/page.tsx).
export function Section({ title, description, actions, children, className = "" }: SectionProps) {
  return (
    <section className={`admin-section ${className}`.trim()}>
      <div className="admin-section__head">
        <div>
          <h2 className="admin-section__title">{title}</h2>
          {description && <p className="admin-section__desc">{description}</p>}
        </div>
        {actions && <div className="admin-section__actions">{actions}</div>}
      </div>
      <div className="admin-section__body">{children}</div>
    </section>
  );
}
