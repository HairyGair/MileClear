"use client";

// Practice accounts (Oct 2026): the queue of accountancy practices. New
// practices show to drivers as "Not checked yet" until they are checked here.
// "Check" covers the practice AND its current logo; a logo changed later goes
// back to initials for drivers until it is checked again.

import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  DataTable,
  FilterBar,
  FilterChip,
  LoadState,
  LoadingSkeleton,
  PageHeader,
  Panel,
  SearchField,
  useAdminData,
  type TableColumn,
} from "@/components/admin/ui";
import { api, fetchWithAuth } from "@/lib/api";

interface PracticeRow {
  id: string;
  name: string;
  initials: string;
  contactName: string;
  email: string;
  phone: string | null;
  professionalBody: string | null;
  arn: string | null;
  checked: boolean;
  checkedAt: string | null;
  paused: boolean;
  reportCount: number;
  lastReportedAt: string | null;
  createdAt: string;
  members: number;
  liveClients: number;
  logo: { updatedAt: string; bytes: number; mime: string; waiting: boolean; shownToDrivers: boolean } | null;
}

type Filter = "all" | "needs" | "reported" | "paused";

function day(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
}

function LogoPreview({ id, version }: { id: string; version: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    fetchWithAuth(`/admin/practices/${id}/logo`)
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        url = URL.createObjectURL(await res.blob());
        setSrc(url);
      })
      .catch(() => setSrc(null));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, version]);
  if (!src) return <span style={{ color: "var(--adm-text-3)" }}>Loading logo</span>;
  return <img src={src} alt="Uploaded logo" style={{ width: 64, height: 64, objectFit: "contain", background: "#fff", borderRadius: 8 }} />;
}

export default function AdminPracticesPage() {
  const { data, error, loading, reload } = useAdminData<PracticeRow[]>("/admin/practices");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("needs");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showLogo, setShowLogo] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((p) => {
      if (filter === "needs" && p.checked && !p.logo?.waiting && p.reportCount === 0) return false;
      if (filter === "reported" && p.reportCount === 0) return false;
      if (filter === "paused" && !p.paused) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || p.contactName.toLowerCase().includes(q);
    });
  }, [data, search, filter]);

  async function act(p: PracticeRow, action: "check" | "uncheck" | "pause" | "resume" | "remove-logo") {
    if (action === "remove-logo" && !window.confirm(`Remove ${p.name}'s logo?`)) return;
    if (action === "pause" && !window.confirm(`Pause ${p.name}? Nothing is shared with them while paused.`)) return;
    setBusy(`${p.id}-${action}`);
    setNotice(null);
    try {
      if (action === "remove-logo") await api.delete(`/admin/practices/${p.id}/logo`);
      else await api.post(`/admin/practices/${p.id}/${action}`);
      setNotice(`${p.name}: done.`);
      reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  const btn = (p: PracticeRow, action: Parameters<typeof act>[1], label: string) => (
    <button
      type="button"
      className="adm-btn adm-btn--sm"
      disabled={busy !== null}
      onClick={(e) => {
        e.stopPropagation();
        void act(p, action);
      }}
      style={{ marginRight: 6 }}
    >
      {busy === `${p.id}-${action}` ? "..." : label}
    </button>
  );

  const cols: TableColumn<PracticeRow>[] = [
    {
      key: "name",
      header: "Practice",
      render: (p) => (
        <>
          {p.name}
          <span className="adm-cell-sub">
            {p.contactName} · {p.email}
            {p.phone ? ` · ${p.phone}` : ""}
          </span>
          <span className="adm-cell-sub">
            {[p.professionalBody && p.professionalBody !== "none" ? p.professionalBody : null, p.arn ? `ARN ${p.arn}` : null, `joined ${day(p.createdAt)}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </>
      ),
      sortValue: (p) => p.name.toLowerCase(),
    },
    {
      key: "status",
      header: "Status",
      render: (p) => (
        <>
          {p.checked ? <Badge tone="good">Checked {day(p.checkedAt)}</Badge> : <Badge tone="warn">Not checked yet</Badge>}
          {p.paused && (
            <span style={{ marginLeft: 6 }}>
              <Badge tone="bad">Paused</Badge>
            </span>
          )}
          {p.reportCount > 0 && (
            <span className="adm-cell-sub">
              Reported {p.reportCount} time{p.reportCount === 1 ? "" : "s"}, last {day(p.lastReportedAt)}
            </span>
          )}
        </>
      ),
      sortValue: (p) => (p.checked ? 1 : 0),
    },
    {
      key: "logo",
      header: "Logo",
      render: (p) =>
        !p.logo ? (
          <span style={{ color: "var(--adm-text-3)" }}>None, initials {p.initials}</span>
        ) : (
          <>
            {showLogo === p.id ? (
              <LogoPreview id={p.id} version={p.logo.updatedAt} />
            ) : (
              <button type="button" className="adm-btn adm-btn--sm" onClick={(e) => { e.stopPropagation(); setShowLogo(p.id); }}>
                View logo
              </button>
            )}
            <span className="adm-cell-sub">
              {p.logo.waiting ? "Changed since the last check: drivers see initials" : p.logo.shownToDrivers ? "Shown to drivers" : "Not shown yet"}
            </span>
          </>
        ),
      sortValue: (p) => (p.logo?.waiting ? 0 : 1),
    },
    { key: "clients", header: "Live clients", render: (p) => p.liveClients, sortValue: (p) => p.liveClients, numeric: true },
    { key: "members", header: "People", render: (p) => p.members, sortValue: (p) => p.members, numeric: true, hideOnMobile: true },
    {
      key: "actions",
      header: "Actions",
      render: (p) => (
        <>
          {(!p.checked || p.logo?.waiting) && btn(p, "check", p.checked ? "Check logo" : "Check")}
          {p.checked && btn(p, "uncheck", "Uncheck")}
          {p.paused ? btn(p, "resume", "Resume") : btn(p, "pause", "Pause")}
          {p.logo && btn(p, "remove-logo", "Remove logo")}
        </>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Practices"
        subtitle="Accountants' and bookkeepers' practice accounts. Drivers see a practice as “Not checked yet” until you check it. Checking also covers its current logo."
      />
      <Panel highlight title={data ? `${rows.length} of ${data.length} practices` : "Practices"} footer={notice ?? undefined}>
        <div style={{ marginBottom: "var(--adm-s4)" }}>
          <FilterBar spaced={false}>
            <SearchField id="practice-search" value={search} onChange={setSearch} label="Search practices" placeholder="Firm, contact or email" />
            <FilterChip active={filter === "needs"} onClick={() => setFilter("needs")} tone="warn">Needs a look</FilterChip>
            <FilterChip active={filter === "reported"} onClick={() => setFilter("reported")} tone="warn">Reported</FilterChip>
            <FilterChip active={filter === "paused"} onClick={() => setFilter("paused")}>Paused</FilterChip>
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>All</FilterChip>
          </FilterBar>
        </div>
        <LoadState data={data} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load the practices." skeleton={<LoadingSkeleton variant="table" rows={6} />}>
          {() => (
            <DataTable
              caption="Practice accounts"
              columns={cols}
              rows={rows}
              rowKey={(p) => p.id}
              initialSort={{ key: "status", dir: "asc" }}
              rowTone={(p) => (p.reportCount > 0 || p.paused ? "bad" : !p.checked || p.logo?.waiting ? "warn" : undefined)}
              maxHeight={760}
              emptyTitle={data?.length ? "Nothing needs a look" : "No practices yet"}
            />
          )}
        </LoadState>
      </Panel>
    </>
  );
}
