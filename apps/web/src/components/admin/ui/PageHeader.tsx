import type { ReactNode } from "react";
import { DateRange } from "./DateRange";
import type { RangeKey } from "./types";

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Buttons or links at the top right. */
  actions?: ReactNode;
  /** Adds the 7d / 30d / 90d / All selector to the actions. */
  range?: {
    value: RangeKey;
    onChange: (v: RangeKey) => void;
    options?: RangeKey[];
  };
  /** ISO time the page's data was generated, shown small under the subtitle. */
  updatedAt?: string | null;
}

/** The top of every admin page: one title, one plain sentence about what the
 *  page answers, and the page-wide controls. */
export function PageHeader({ title, subtitle, actions, range, updatedAt }: PageHeaderProps) {
  return (
    <header className="adm-pagehead">
      <div className="adm-pagehead__text">
        <h1 className="adm-pagehead__title">{title}</h1>
        {subtitle && <p className="adm-pagehead__subtitle">{subtitle}</p>}
        {updatedAt && (
          <p className="adm-pagehead__meta">
            Updated {new Date(updatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
      {(actions || range) && (
        <div className="adm-pagehead__actions">
          {range && <DateRange value={range.value} onChange={range.onChange} options={range.options} />}
          {actions}
        </div>
      )}
    </header>
  );
}
