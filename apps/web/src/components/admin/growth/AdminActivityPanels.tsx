"use client";

// Insights > Admin activity: grant a comp Pro account, the admin audit log
// (which records every grant), and the email events outbox.

import { useCallback, useState, type CSSProperties } from "react";
import { Ago } from "@/components/admin/Ago";
import { api } from "@/lib/api";
import {
  Badge,
  DataTable,
  LoadState,
  LoadingSkeleton,
  Panel,
  formatNumber,
  useAdminData,
  type AdminData,
  type TableColumn,
} from "@/components/admin/ui";
import { STACK, formatDateTime } from "./format";
import type { AuditEvent, EmailEvent } from "./types";

const inputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  height: 38,
  padding: "0 var(--adm-s3)",
  background: "var(--adm-panel-raised)",
  border: "1px solid var(--adm-border-strong)",
  borderRadius: "var(--adm-radius-sm)",
  color: "var(--adm-text-strong)",
  font: "inherit",
  fontSize: "0.875rem",
};

const labelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--adm-s1)", fontSize: "0.78rem", color: "var(--adm-text-2)" };

// ---------------------------------------------------------------------------
// Comp Pro
// ---------------------------------------------------------------------------

function CompProPanel({ onDone }: { onDone: () => void }) {
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [months, setMonths] = useState(12);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (!userId.trim() || !reason.trim()) {
      setError("User ID and reason are both required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<{ data: { ok: boolean; premiumExpiresAt: string } }>(`/admin/users/${userId.trim()}/comp-premium`, {
        reason: reason.trim(),
        months,
      });
      setResult(`Comped Pro until ${new Date(res.data.premiumExpiresAt).toLocaleDateString("en-GB")}.`);
      setUserId("");
      setReason("");
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Comp failed");
    } finally {
      setSubmitting(false);
    }
  }, [userId, reason, months, onDone]);

  return (
    <Panel
      title="Comp a Pro account"
      subtitle="Give a driver Pro for free, with a reason. Every grant is written to the audit log."
      footer="Sets the Pro end date to today plus 30 days per month, replacing any end date the account already has."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s3)" }}
      >
        {error && (
          <p role="alert" style={{ margin: 0 }}>
            <Badge tone="bad" size="md">{error}</Badge>
          </p>
        )}
        {result && (
          <p role="status" style={{ margin: 0 }}>
            <Badge tone="good" size="md">{result}</Badge>
          </p>
        )}
        <label style={labelStyle}>
          User ID
          <input type="text" placeholder="The account's UUID" value={userId} onChange={(e) => setUserId(e.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Reason
          <input
            type="text"
            placeholder="For example: Beta tester comp, Press review"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ ...labelStyle, maxWidth: 120 }}>
          Months
          <input
            type="number"
            min={1}
            max={120}
            value={months}
            onChange={(e) => setMonths(parseInt(e.target.value || "0", 10) || 0)}
            style={inputStyle}
          />
        </label>
        <div>
          <button type="submit" className="adm-btn adm-btn--primary" disabled={submitting}>
            {submitting ? "Comping..." : "Comp Pro"}
          </button>
        </div>
      </form>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

const preStyle: CSSProperties = {
  margin: 0,
  fontFamily: "ui-monospace, monospace",
  fontSize: "0.72rem",
  color: "var(--adm-text-2)",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  maxWidth: 420,
};

const auditColumns: TableColumn<AuditEvent>[] = [
  { key: "action", header: "Action", sortValue: (e) => e.action, render: (e) => <strong style={{ color: "var(--adm-text-strong)" }}>{e.action}</strong> },
  { key: "target", header: "Driver", sortValue: (e) => e.userLabel, render: (e) => e.userLabel ?? <span style={{ color: "var(--adm-text-3)" }}>-</span> },
  {
    key: "when",
    header: "When",
    sortValue: (e) => e.createdAt,
    render: (e) => (
      <span style={{ whiteSpace: "nowrap" }}>
        {formatDateTime(e.createdAt)}
        <span className="adm-cell-sub"><Ago iso={e.createdAt} /></span>
      </span>
    ),
  },
  {
    key: "details",
    header: "Details",
    render: (e) =>
      e.metadata && Object.keys(e.metadata).length > 0 ? <pre style={preStyle}>{JSON.stringify(e.metadata, null, 2)}</pre> : null,
  },
];

function AuditLogPanel({ audit }: { audit: AdminData<AuditEvent[]> }) {
  const { data, error, loading, reload } = audit;
  return (
    <Panel
      title="Admin audit log"
      subtitle="Comp grants, Pro toggles and other admin actions. Most recent first, last 100."
      actions={data ? <Badge>{formatNumber(data.length)} shown</Badge> : undefined}
      flush
    >
      <LoadState
        data={data}
        loading={loading}
        error={error}
        onRetry={reload}
        errorTitle="Couldn't load the audit log."
        skeleton={<LoadingSkeleton variant="table" rows={6} />}
      >
        {(d) => (
          <DataTable
            caption="Admin audit log"
            columns={auditColumns}
            rows={d}
            rowKey={(e) => e.id}
            maxHeight={560}
            emptyTitle="No admin actions logged yet"
          />
        )}
      </LoadState>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Email events
// ---------------------------------------------------------------------------

const emailColumns: TableColumn<EmailEvent>[] = [
  { key: "type", header: "Event", sortValue: (e) => e.type, render: (e) => <strong style={{ color: "var(--adm-text-strong)" }}>{e.type}</strong> },
  { key: "user", header: "Driver", sortValue: (e) => e.userLabel, render: (e) => e.userLabel ?? <span style={{ color: "var(--adm-text-3)" }}>-</span> },
  { key: "when", header: "When", sortValue: (e) => e.createdAt, render: (e) => <span style={{ whiteSpace: "nowrap" }}>{formatDateTime(e.createdAt)}</span> },
];

function EmailEventsPanel() {
  const { data, error, loading, reload } = useAdminData<EmailEvent[]>("/admin/email-events");
  return (
    <Panel
      title="Email events"
      subtitle={'App events whose type starts with "email.", most recent first, last 100.'}
      flush
    >
      <LoadState
        data={data}
        loading={loading}
        error={error}
        onRetry={reload}
        errorTitle="Couldn't load the email events."
        skeleton={<LoadingSkeleton variant="table" rows={4} />}
      >
        {(d) => (
          <DataTable
            caption="Email events"
            columns={emailColumns}
            rows={d}
            rowKey={(e) => e.id}
            maxHeight={480}
            emptyTitle="No email events logged"
            empty={'Nothing here means the email service has not logged any "email." events (for example email.sent or email.bounced).'}
          />
        )}
      </LoadState>
    </Panel>
  );
}

export function AdminActivityTab() {
  const audit = useAdminData<AuditEvent[]>("/admin/audit-log");
  return (
    <div style={STACK}>
      <div className="adm-split">
        <AuditLogPanel audit={audit} />
        <CompProPanel onDone={audit.reload} />
      </div>
      <EmailEventsPanel />
    </div>
  );
}
