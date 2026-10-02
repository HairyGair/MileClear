# Admin UI kit: style guide

How to build or rebuild an admin page so it matches the Overview. Read this
before touching any page under `src/app/dashboard/admin/`.

- Kit: `src/components/admin/ui/` (import everything from `@/components/admin/ui`)
- Styles: `src/app/dashboard/admin/admin.css` (loaded by the admin layout, all classes start `adm-`)
- Shared panels (QR scans, acquisition, daily sign-ups hook, response types): `src/components/admin/panels/`
- Worked examples: `admin/page.tsx` (Overview) and `admin/acquisition/page.tsx`

## 1. Page skeleton

The admin layout already draws the sidebar, the top bar (breadcrumb + user
search) and the page padding. A page returns a fragment: one `PageHeader`,
then rows. The content column stacks its children with a 1.5rem gap, so do
not add margins between rows.

```tsx
"use client";

import { DataTable, Grid, KpiCard, LoadState, LoadingSkeleton, PageHeader, Panel, useAdminData, type RangeKey } from "@/components/admin/ui";
import { useState } from "react";

export default function AdminThingPage() {
  const [range, setRange] = useState<RangeKey>("30d");
  const summary = useAdminData<Summary>(`/admin/thing?days=${range}`);

  return (
    <>
      <PageHeader
        title="Thing"
        subtitle="One plain sentence about the question this page answers."
        range={{ value: range, onChange: setRange, options: ["7d", "30d", "90d"] }}
        updatedAt={summary.data?.generatedAt}
      />

      <Grid min={180}>
        <KpiCard label="Drivers" value={summary.data?.drivers ?? 0} loading={summary.loading && !summary.data} error={summary.error} />
        {/* three to six KPI cards */}
      </Grid>

      <div className="adm-split">           {/* 2/3 + 1/3, stacks under 1100px */}
        <Panel title="Main chart" highlight>...</Panel>
        <Panel title="Side detail">...</Panel>
      </div>

      <Panel title="Every row" flush>
        <DataTable ... />
      </Panel>
    </>
  );
}
```

Order on a page: headline numbers first, then the chart or list that explains
them, then the detail tables. If a page has more than about five panels, put
the secondary ones in `Tabs` inside a Panel rather than making the page longer.

Do not use the old `AdminPage`, `Section`, `StatGrid`, `stat-card` or
`Card` from `components/ui` on rebuilt pages. They still work for pages that
have not been rebuilt yet.

## 2. Which component for what

| Need | Use |
|---|---|
| Page title, subtitle, page-wide buttons, 7d/30d/90d/All | `PageHeader` (`range` prop adds `DateRange`) |
| A headline number | `KpiCard` (add `delta` for a period comparison, `sparkline` for a trend, `href` to make it a link) |
| Any boxed section | `Panel` (`title`, `subtitle`, `actions`, `href` adds a "View all" link, `footer` for source notes, `flush` for an edge-to-edge table, `highlight` for the one panel the page is about) |
| A row of cards or panels | `Grid min={...}` (wraps to fit, one column on phones) |
| Main + side column | `<div className="adm-split">` |
| Rows of records | `DataTable` (give columns `sortValue` to make them sortable, `onRowClick` to open a record, `maxHeight` for a sticky header, `hideOnMobile` on non-essential columns) |
| Change over time (counts per day / month) | `BarChart` |
| A continuous trend, or this period against last | `LineChart` (`compare` draws the previous period dashed grey) |
| A ranked breakdown (sources, regions, platforms) | `BarList` (not a pie chart) |
| A tiny trend inside a card or cell | `Sparkline` |
| Progress to a target, or a share of a whole | `ProgressBar` |
| Status or category label | `Badge` (`tone`, `dot`) |
| Switching between views | `Tabs` (panels mount only when picked, so their data loads on demand) or `TabBar` for a controlled bar in a Panel's `actions` |
| Label / value lines in a small panel | `StatLine` |
| One big number inside a panel | `<div className="adm-figure"><span className="adm-figure__value">..</span><span className="adm-figure__label">..</span></div>` |
| Small print, source notes | `<p className="adm-note">`; body copy `<p className="adm-text">` |
| Buttons and link-buttons | `className="adm-btn"`, `adm-btn adm-btn--primary` (one per page at most), `adm-btn--sm` |
| Icons | `<AdminIcon name="..." />` (inline SVG, no icon library; add a path to `icons.tsx` if you need a new one) |

## 3. Loading and errors

Every panel loads its own data with `useAdminData`, and wraps its body in
`LoadState`. A slow or failing endpoint then only affects its own panel; the
rest of the page still renders. Never `Promise.all` several endpoints into
one page-wide loading flag.

```tsx
function SupportHub() {
  const { data, error, loading, reload } = useAdminData<SupportQueueData>("/admin/support-queue");
  return (
    <Panel title="Waiting on a reply" href="/dashboard/admin/support" hrefLabel="Open support">
      <LoadState
        data={data}
        loading={loading}
        error={error}
        onRetry={reload}
        errorTitle="Couldn't load the support queue."
        skeleton={<LoadingSkeleton variant="table" rows={5} />}
      >
        {(d) => (d.items.length === 0 ? <EmptyState compact title="Nobody is waiting" /> : <DataTable ... />)}
      </LoadState>
    </Panel>
  );
}
```

- `useAdminData(path)` unwraps `{ data: T }`. Pass `{ unwrap: false }` for an
  endpoint that returns its body directly (for example `/admin/team-interest`).
  Pass `path = null` to wait (for a tab that is not open yet).
- Changing `path` refetches, so put the range in the path.
- Skeletons should have the shape of what is coming: `kpi`, `chart`, `table`,
  `lines`, `block`. `KpiCard` has its own `loading` and `error` props.
- `ErrorState` always says what failed in plain words ("Couldn't load the
  QR scans.") and offers "Try again". The raw message goes underneath.
- `EmptyState` says why it is empty and, when useful, what would fill it.
- Mutations: call `api.post/patch/delete` from `@/lib/api`, then `reload()`.

## 4. Spacing, type and colour

Use the tokens on `.adm` (defined at the top of `admin.css`); never hard-code
hex values or pixel spacing in a page.

- Spacing: `--adm-s1` 4px, `--adm-s2` 8px, `--adm-s3` 12px, `--adm-s4` 16px,
  `--adm-s5` 24px, `--adm-s6` 32px. Rows on a page are 24px apart (automatic);
  cards in a grid 16px (`Grid`) or 12px (`Grid gap="sm"`, inside a Panel).
- Text: `--adm-text-strong` for figures and titles, `--adm-text` for body,
  `--adm-text-2` for secondary, `--adm-text-3` for notes. All pass contrast
  on the panel background.
- Colour roles:
  - `accent` (amber): the brand, the main chart series, the single most
    important number. Do not make everything amber.
  - `good` / `warn` / `bad`: status only (healthy / needs a look / broken).
    Never use them to tell two series apart, and always pair them with a word
    or icon, never colour alone.
  - `info` (blue): neutral system information such as "Admin" or "New".
  - `neutral`: everything else.
- Charts: one series is amber. A comparison is grey dashed. If you need more
  than two series, use separate charts or a `BarList`, not a rainbow. Never
  put two different measures on one chart with two axes.
- Numbers: always `formatNumber` (thousands separators, never "1.2K" in a
  card) and `formatPence` for money (all money is pence). Use `numeric` on
  table columns so figures line up.
- Fonts come from the dashboard: Sora for titles and figures, Outfit for
  everything else. Do not set font families in a page.

## 5. Copy

- UK English. Plain words: "Waiting on a reply", not "Pending SLA breach".
  Say what it means for a driver, not for the codebase.
- No em dashes in anything a person reads. Use a comma, a full stop or
  brackets.
- Never put an adjective about MileClear next to "HMRC".
- Labels in sentence case ("Paying subscribers", not "Paying Subscribers").
- Every subtitle and note must be true. If a figure has a caveat (counted
  from a date, excludes deleted accounts), say it in the panel `footer`.

## 6. Accessibility and phones

- Everything must work at 375px wide with no sideways page scroll.
  `DataTable` scrolls inside itself; mark non-essential columns
  `hideOnMobile`. Use `Grid` rather than fixed column counts.
- Charts take a `label`; it names the chart for screen readers and captions
  the hidden data table each chart renders. Charts are keyboard readable
  (focus, then arrow keys).
- Give a `Tabs`/`TabBar` a `label`. Tables a `caption`.
- Clickable rows come from `onRowClick` (keyboard: Enter). Do not put
  `onClick` on a `div`; use a `button` or `Link`.
- The focus ring is amber and automatic for anything inside `.adm`.

## 7. Adding a nav item

The sidebar, the phone drawer and the breadcrumb all read
`src/components/admin/ui/nav.ts`.

```ts
// In ADMIN_NAV, inside the right group:
{
  label: "Payouts",                       // short, sentence case
  href: `${ADMIN_ROOT}/payouts`,
  icon: "revenue",                       // an AdminIconName from icons.tsx
  hint: "What we paid out and when",     // tooltip
  children: [{ label: "Disputes", href: `${ADMIN_ROOT}/payouts/disputes` }], // optional sub-pages, listed under it
  aliases: [`${ADMIN_ROOT}/old-payouts`],  // optional old URLs that should light it up
  isNew: true,                           // optional "New" marker; remove after a few weeks
}
```

Then create `src/app/dashboard/admin/payouts/page.tsx`. Never delete or move an
existing admin URL: if a page moves, keep the old path as a child or alias so
bookmarks and links in support notes still work.

Groups: Overview, Growth, Drivers, Money, Operations. Add to an existing group
before inventing a new one.

## 8. Checks before you hand back

From `apps/web`: `npx tsc --noEmit`, `npx eslint src`, `npx next build`
(read the route table; every admin route must still be listed).
