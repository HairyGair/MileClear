import type { ReactNode } from "react";

interface AdminPageProps {
  title: string;
  intro?: ReactNode;
  actions?: ReactNode;
  /** ISO timestamp of the data the page shows, rendered as a small footer line. */
  generatedAt?: string | null;
  loading?: boolean;
  error?: string | null;
  children: ReactNode;
}

// The frame every admin section page renders inside: a header row, an
// optional one-line intro, the content, and the data's own timestamp.
export function AdminPage({ title, intro, actions, generatedAt, loading, error, children }: AdminPageProps) {
  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">{title}</h1>
          {intro && <p className="admin-page__intro">{intro}</p>}
        </div>
        {actions && <div className="admin-page__actions">{actions}</div>}
      </div>
      {loading && <p className="admin-page__status">Loading...</p>}
      {error && <p className="admin-page__status admin-page__status--error">Error: {error}</p>}
      {!loading && !error && children}
      {generatedAt && (
        <p className="admin-page__generated">
          Generated {new Date(generatedAt).toLocaleString("en-GB")}
        </p>
      )}
    </div>
  );
}
