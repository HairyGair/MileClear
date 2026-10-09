// The dashboard UI kit. Import everything from here:
//   import { Button, Card, PageHeader, SettingsRow, useToast } from "@/components/dashboard/kit";
// (Also re-exported from "@/components/mc".) Styles: kit.css, tokens: app/dashboard/tokens.css.

export { cx } from "./cx";
export { Icon, type IconName } from "./Icon";
export { Button, type ButtonProps } from "./Button";
export { Card, SectionHeader, ActionLink, type CardAction } from "./Card";
export { SettingsGroup, SettingsRow, ToggleRow, type SettingsRowProps } from "./Settings";
export { EmptyState, ErrorState, CardError, Skeleton } from "./States";
export { ProGate, ProChip } from "./Pro";
export { Segmented, FilterChips, StatusChip, type SegmentOption } from "./Controls";
export { Figure, StatTile } from "./Figure";
export { DataTable, Table, type Column } from "./DataTable";
export { Dialog, ConfirmDialog } from "./Dialog";
export { Menu, type MenuItem } from "./Menu";
export { ToastProvider, useToast } from "./Toast";
export {
  TextField, NumberField, MoneyField, SelectField, DateField, TimeField,
  DateRangeField, TextArea, Toggle,
} from "./Fields";
export { TaxYearPicker } from "./TaxYearPicker";
export { PlaceField, type PlaceValue } from "./PlaceField";
export { MapView, type MapViewProps } from "./MapView";
export { PageHeader } from "./PageHeader";
export { useMe, useUnclassifiedCount, type Me } from "../../../lib/dashboard/useMe";
export { useData } from "../../../lib/dashboard/useData";
export * from "../../../lib/dashboard/format";
