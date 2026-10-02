// The admin UI kit. Import everything from here:
//   import { PageHeader, KpiCard, Panel, ... } from "@/components/admin/ui";
// Rules and examples: ./STYLEGUIDE.md

export { PageHeader } from "./PageHeader";
export { DateRange } from "./DateRange";
export { KpiCard, type KpiDelta } from "./KpiCard";
export { Panel, Card, Grid, StatLine } from "./Panel";
export { DataTable, type TableColumn } from "./DataTable";
export { Tabs, TabBar, type TabItem } from "./Tabs";
export { Badge, Pill } from "./Badge";
export { Sparkline } from "./Sparkline";
export { BarChart } from "./BarChart";
export { LineChart } from "./LineChart";
export { BarList, type BarListItem } from "./BarList";
export { ProgressBar } from "./ProgressBar";
export { EmptyState, ErrorState, LoadingSkeleton, LoadState } from "./States";
export { AdminIcon, type AdminIconName } from "./icons";
export { useAdminData, type AdminData } from "./useAdminData";
export { ADMIN_NAV, ADMIN_ROOT, findActiveNav, type AdminNavGroup, type AdminNavItem } from "./nav";
export { formatNumber, formatPence, formatShare, percentChange, formatDay, formatMonth, dayKey } from "./format";
export type { ChartDatum } from "./chartUtils";
export type { Tone, RangeKey } from "./types";
export { RANGE_DAYS } from "./types";
