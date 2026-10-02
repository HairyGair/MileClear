"use client";

// Ops: Apple in-app purchase webhooks. The log of every App Store server
// notification, with the tools for orphans (a payment we could not tie to a
// MileClear account): reprocess, link by email, and mark as a ghost.

import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import {
  Badge,
  Checkbox,
  DataTable,
  Dialog,
  ExpandableText,
  LoadState,
  LoadingSkeleton,
  Notice,
  Panel,
  SelectInput,
  Spinner,
  TextInput,
  formatNumber,
  useAdminData,
  type TableColumn,
} from "@/components/admin/ui";
import { runTone, type AppleWebhookLog, type AppleWebhookResponse, type OrphanReprocessResult } from "./types";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "success", label: "success" },
  { value: "verification_failed", label: "verification_failed" },
  { value: "no_user", label: "no_user" },
  { value: "handler_error", label: "handler_error" },
  { value: "unhandled", label: "unhandled" },
  { value: "no_transaction_id", label: "no_transaction_id" },
  { value: "invalid_json", label: "invalid_json" },
  { value: "missing_payload", label: "missing_payload" },
  { value: "not_configured", label: "not_configured" },
];

type NoticeState = { kind: "ok" | "warn" | "err"; text: string } | null;
const NOTICE_TONE = { ok: "good", warn: "warn", err: "bad" } as const;

const errMsg = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export function AppleWebhooksPanel() {
  const [status, setStatus] = useState("");
  const [includeGhosts, setIncludeGhosts] = useState(false);

  const params = new URLSearchParams({ page: "1", pageSize: "50" });
  if (status) params.set("status", status);
  if (includeGhosts) params.set("includeGhosts", "1");
  const wh = useAdminData<AppleWebhookResponse>(`/admin/apple-webhooks?${params}`, { unwrap: false });
  const reload = wh.reload;

  // null = idle, "all" / "consumption" / "auto-mark" = bulk action, "<txnId>" = one row
  const [busy, setBusy] = useState<string | null>(null);
  const [ghostBusy, setGhostBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);

  const [linkTxn, setLinkTxn] = useState<string | null>(null);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const respondPendingConsumption = useCallback(async () => {
    setBusy("consumption");
    setNotice(null);
    try {
      const res = await api.post<{
        data: { processed: number; results: Array<{ txn: string; ok: boolean; reason?: string; orphan: boolean }> };
      }>("/admin/apple/respond-consumption-pending", {});
      const ok = res.data.results.filter((r) => r.ok).length;
      const fail = res.data.results.length - ok;
      setNotice({
        kind: ok > 0 ? "ok" : fail === 0 ? "warn" : "err",
        text: res.data.processed === 0 ? "No CONSUMPTION_REQUEST webhooks waiting for a response." : `Consumption responses: ${ok} submitted, ${fail} failed.`,
      });
      reload();
    } catch (err) {
      setNotice({ kind: "err", text: errMsg(err, "Consumption response failed") });
    } finally {
      setBusy(null);
    }
  }, [reload]);

  const markGhost = useCallback(
    async (txnId: string) => {
      setGhostBusy(txnId);
      setNotice(null);
      try {
        await api.post(`/admin/apple/ghosts/${encodeURIComponent(txnId)}`, {});
        setNotice({ kind: "ok", text: `${txnId.slice(0, 12)}…  Marked as a ghost: hidden from the 24-hour counts and the default view.` });
        reload();
      } catch (err) {
        setNotice({ kind: "err", text: errMsg(err, "Mark ghost failed") });
      } finally {
        setGhostBusy(null);
      }
    },
    [reload]
  );

  const unmarkGhost = useCallback(
    async (txnId: string) => {
      setGhostBusy(txnId);
      setNotice(null);
      try {
        await api.delete(`/admin/apple/ghosts/${encodeURIComponent(txnId)}`);
        setNotice({ kind: "ok", text: `${txnId.slice(0, 12)}…  Unmarked: back in the default view.` });
        reload();
      } catch (err) {
        setNotice({ kind: "err", text: errMsg(err, "Unmark failed") });
      } finally {
        setGhostBusy(null);
      }
    },
    [reload]
  );

  const autoMarkGhosts = useCallback(async () => {
    setBusy("auto-mark");
    setNotice(null);
    try {
      const res = await api.post<{ data: { marked: number; skipped: number; threshold: number; candidates: string[] } }>(
        "/admin/apple/ghosts/auto-mark",
        { threshold: 3 }
      );
      setNotice({
        kind: res.data.marked > 0 ? "ok" : "warn",
        text:
          res.data.marked === 0 && res.data.skipped === 0
            ? `No transactions with ${res.data.threshold} or more orphan events yet.`
            : `Auto-marked ${res.data.marked} ghost(s) (${res.data.threshold} or more orphan events). ${res.data.skipped} already flagged.`,
      });
      reload();
    } catch (err) {
      setNotice({ kind: "err", text: errMsg(err, "Auto-mark failed") });
    } finally {
      setBusy(null);
    }
  }, [reload]);

  const reprocessAll = useCallback(async () => {
    setBusy("all");
    setNotice(null);
    try {
      const res = await api.post<{ data: { processed: number; results: OrphanReprocessResult[] } }>("/admin/apple/reprocess-orphans", {});
      const linked = res.data.results.filter((r) => r.outcome === "linked").length;
      const stillUnlinked = res.data.results.length - linked;
      setNotice({ kind: linked > 0 ? "ok" : "warn", text: `Processed ${res.data.processed}: ${linked} linked, ${stillUnlinked} still unlinked.` });
      reload();
    } catch (err) {
      setNotice({ kind: "err", text: errMsg(err, "Reprocess failed") });
    } finally {
      setBusy(null);
    }
  }, [reload]);

  const reprocessOne = useCallback(
    async (txnId: string) => {
      setBusy(txnId);
      setNotice(null);
      try {
        const res = await api.post<{ data: OrphanReprocessResult }>(`/admin/apple/reprocess-orphan/${encodeURIComponent(txnId)}`, {});
        const r = res.data;
        const friendly =
          r.outcome === "linked"
            ? `Linked to ${r.userEmail ?? r.userId ?? "user"}`
            : r.outcome === "no_appAccountToken"
              ? "No appAccountToken on the canonical transaction"
              : r.outcome === "still_no_user"
                ? "Apple's appAccountToken matched no user"
                : r.outcome === "conflict"
                  ? "User already linked to a different transaction"
                  : r.outcome === "fetch_failed"
                    ? "Apple API fetch failed"
                    : r.outcome;
        setNotice({ kind: r.outcome === "linked" ? "ok" : "warn", text: `${txnId.slice(0, 12)}…  ${friendly}` });
        reload();
      } catch (err) {
        setNotice({ kind: "err", text: errMsg(err, "Reprocess failed") });
      } finally {
        setBusy(null);
      }
    },
    [reload]
  );

  const submitManualLink = useCallback(async () => {
    if (!linkTxn || !linkEmail) return;
    setLinkSubmitting(true);
    setLinkError(null);
    try {
      const res = await api.post<{ data: { userId: string; userEmail: string; displayName: string | null; originalTransactionId: string } }>(
        "/admin/apple/link-orphan",
        { originalTransactionId: linkTxn, email: linkEmail.trim() }
      );
      const r = res.data;
      setNotice({ kind: "ok", text: `${linkTxn.slice(0, 12)}…  Linked to ${r.displayName ?? r.userEmail}` });
      setLinkTxn(null);
      setLinkEmail("");
      reload();
    } catch (err) {
      setLinkError(errMsg(err, "Link failed"));
    } finally {
      setLinkSubmitting(false);
    }
  }, [linkTxn, linkEmail, reload]);

  const anyBusy = busy !== null || ghostBusy !== null;

  const columns: TableColumn<AppleWebhookLog>[] = [
    {
      key: "received",
      header: "Received",
      sortValue: (w) => w.receivedAt,
      render: (w) => <span style={{ whiteSpace: "nowrap" }}>{new Date(w.receivedAt).toLocaleString("en-GB")}</span>,
    },
    {
      key: "env",
      header: "Env",
      title: "Production = App Store customer. Sandbox = TestFlight tester or App Review; grants Pro, never revenue.",
      render: (w) => (w.environment === "sandbox" ? <Badge tone="accent">sandbox</Badge> : w.environment || "-"),
    },
    { key: "type", header: "Type", render: (w) => <span className="adm-mono">{w.notificationType || "-"}</span> },
    { key: "subtype", header: "Subtype", hideOnMobile: true, render: (w) => <span className="adm-mono">{w.subtype || "-"}</span> },
    {
      key: "status",
      header: "Status",
      sortValue: (w) => w.status,
      render: (w) => (
        <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
          <Badge tone={runTone(w.status)}>{w.status}</Badge>
          {w.isGhost && (
            <Badge title="Marked as a ghost: left out of the 24-hour counts and the default view">ghost</Badge>
          )}
        </span>
      ),
    },
    {
      key: "txn",
      header: "Transaction",
      hideOnMobile: true,
      render: (w) => (
        <span className="adm-mono" title={w.originalTransactionId ?? undefined} style={{ color: "var(--adm-text-3)" }}>
          {w.originalTransactionId ? `${w.originalTransactionId.slice(0, 12)}...` : "-"}
        </span>
      ),
    },
    {
      key: "user",
      header: "User",
      hideOnMobile: true,
      render: (w) => (
        <span className="adm-mono" title={w.userId ?? undefined} style={{ color: "var(--adm-text-3)" }}>
          {w.userId ? `${w.userId.slice(0, 8)}...` : "-"}
        </span>
      ),
    },
    { key: "error", header: "Error", render: (w) => (w.errorMessage ? <ExpandableText text={w.errorMessage} max={280} /> : "-") },
    {
      key: "action",
      header: "Action",
      render: (w) => {
        const txn = w.originalTransactionId;
        if (w.status !== "no_user" || !txn) return "-";
        return (
          <div className="adm-actions" style={{ flexWrap: "nowrap" }}>
            {!w.isGhost && (
              <button type="button" className="adm-btn adm-btn--sm" onClick={() => reprocessOne(txn)} disabled={anyBusy}>
                {busy === txn ? "…" : "Reprocess"}
              </button>
            )}
            {!w.isGhost && (
              <button
                type="button"
                className="adm-btn adm-btn--sm"
                onClick={() => {
                  setLinkTxn(txn);
                  setLinkEmail("");
                  setLinkError(null);
                }}
                disabled={anyBusy}
              >
                Link…
              </button>
            )}
            {w.isGhost ? (
              <button
                type="button"
                className="adm-btn adm-btn--sm adm-btn--ghost"
                onClick={() => unmarkGhost(txn)}
                disabled={ghostBusy !== null}
                title="Bring this transaction back into the default view"
              >
                {ghostBusy === txn ? "…" : "Unmark"}
              </button>
            ) : (
              <button
                type="button"
                className="adm-btn adm-btn--sm adm-btn--ghost"
                onClick={() => markGhost(txn)}
                disabled={anyBusy}
                title="Mark this transaction as a known ghost: hide it from the 24-hour counts and the default view"
              >
                {ghostBusy === txn ? "…" : "Ghost"}
              </button>
            )}
          </div>
        );
      },
    },
  ];

  const d = wh.data;
  const showReprocessAll = !!d && ((d.last24h["no_user"] ?? 0) > 0 || status === "no_user");

  return (
    <>
      <Panel
        title="Apple in-app purchase webhooks"
        subtitle="Every App Store server notification, newest first (latest 50). An orphan (no_user) is a payment we could not tie to an account."
        actions={
          <button type="button" className="adm-btn adm-btn--sm" onClick={reload} disabled={wh.loading}>
            {wh.loading ? "Refreshing" : "Refresh"}
          </button>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s4)" }}>
          {d && (
            <div style={{ display: "flex", gap: "var(--adm-s2)", flexWrap: "wrap", alignItems: "center" }}>
              <span className="adm-field__label">Last 24 hours:</span>
              {Object.keys(d.last24h).length === 0 ? (
                <span className="adm-note">no events</span>
              ) : (
                Object.entries(d.last24h).map(([s, n]) => (
                  <Badge key={s} tone={runTone(s)}>
                    {s}: {formatNumber(n)}
                  </Badge>
                ))
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: "var(--adm-s3)", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ minWidth: 200 }}>
              <SelectInput label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={STATUS_OPTIONS} />
            </div>
            <div style={{ paddingBottom: 8 }}>
              <Checkbox checked={includeGhosts} onChange={setIncludeGhosts} title="Include rows for transactions you've marked as ghosts">
                Show ghosts{d?.ghostCount && d.ghostCount > 0 ? ` (${formatNumber(d.ghostCount)})` : ""}
              </Checkbox>
            </div>
          </div>

          <div className="adm-actions">
            {showReprocessAll && (
              <button type="button" className="adm-btn adm-btn--sm" onClick={reprocessAll} disabled={busy !== null}>
                {busy === "all" ? <><Spinner /> Reprocessing</> : "Reprocess all orphans"}
              </button>
            )}
            <button
              type="button"
              className="adm-btn adm-btn--sm"
              onClick={respondPendingConsumption}
              disabled={busy !== null}
              title="Submit consumption-data responses for any CONSUMPTION_REQUEST webhooks awaiting a response (last 14 days)"
            >
              {busy === "consumption" ? <><Spinner /> Submitting</> : "Respond to waiting CONSUMPTION_REQUESTs"}
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--sm"
              onClick={autoMarkGhosts}
              disabled={busy !== null}
              title="Flag any transaction with 3 or more no_user events as a ghost. Hides them from the 24-hour counts and the default view."
            >
              {busy === "auto-mark" ? <><Spinner /> Marking</> : "Auto-mark ghosts"}
            </button>
          </div>

          {notice && <Notice tone={NOTICE_TONE[notice.kind]}>{notice.text}</Notice>}
        </div>
      </Panel>

      <Panel title="Webhook log" flush>
        <LoadState
          data={wh.data}
          loading={wh.loading}
          error={wh.error}
          onRetry={reload}
          errorTitle="Couldn't load the Apple webhooks."
          skeleton={<div style={{ padding: "var(--adm-s4)" }}><LoadingSkeleton variant="table" rows={8} /></div>}
        >
          {(x) => (
            <DataTable
              caption="Apple in-app purchase webhook log"
              columns={columns}
              rows={x.data}
              rowKey={(w) => w.id}
              maxHeight={640}
              emptyTitle="No webhook entries yet"
              dense
            />
          )}
        </LoadState>
      </Panel>

      {/* Used when an orphan has no appAccountToken on the canonical
          transaction (a pre-1.1.0 purchase) and the driver has contacted
          support to claim it. */}
      <Dialog
        open={linkTxn !== null}
        onClose={() => setLinkTxn(null)}
        busy={linkSubmitting}
        title="Link an Apple purchase to a driver"
        footer={
          <>
            <button type="button" className="adm-btn adm-btn--sm adm-btn--ghost" onClick={() => setLinkTxn(null)} disabled={linkSubmitting}>
              Cancel
            </button>
            <button type="button" className="adm-btn adm-btn--sm adm-btn--primary" onClick={submitManualLink} disabled={linkSubmitting || !linkEmail.trim()}>
              {linkSubmitting ? "Linking…" : "Link and grant Pro"}
            </button>
          </>
        }
      >
        <p className="adm-text">
          Use this when a driver has confirmed they paid for Pro but the app shows them as Free (usually a purchase from before 1.1.0, whose{" "}
          <code>appAccountToken</code> was never recorded).
        </p>
        <p className="adm-note adm-mono">Transaction: {linkTxn ?? ""}</p>
        <TextInput
          label="MileClear account email"
          type="email"
          value={linkEmail}
          onChange={(e) => setLinkEmail(e.target.value)}
          placeholder="user@example.com"
          onKeyDown={(e) => {
            if (e.key === "Enter" && linkEmail.trim() && !linkSubmitting) submitManualLink();
          }}
        />
        {linkError && <Notice tone="bad">{linkError}</Notice>}
      </Dialog>
    </>
  );
}
