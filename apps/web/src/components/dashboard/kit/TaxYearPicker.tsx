"use client";

import { useMemo } from "react";
import { recentTaxYears } from "../../../lib/dashboard/periods";
import { SelectField } from "./Fields";

/** Tax year select. Default list: the current year and the 3 before it. */
export function TaxYearPicker({
  value,
  onChange,
  years,
  label = "Tax year",
}: {
  value: string;
  onChange: (ty: string) => void;
  years?: string[];
  label?: string;
}) {
  const list = useMemo(() => years ?? recentTaxYears(), [years]);
  return <SelectField label={label} value={value} onChange={onChange} options={list.map((y) => ({ value: y, label: y }))} />;
}
