"use client";

import { api } from "@/lib/api";
import { PageHeader, SettingsGroup, SettingsRow, useData, useMe } from "@/components/dashboard/kit";
import { TaxReadinessCard } from "@/components/dashboard/tax/TaxReadinessCard";
import "@/components/dashboard/tax/tax.css";

interface HmrcStatus {
  connected: boolean;
}

/** Tax hub: the readiness card, then links grouped by what the driver needs. */
export default function TaxHubPage() {
  const { isCompanyDriver, isGigDriver, isEmployee } = useMe();
  // 200 + connected shows the quarterly row. Any error (503 not configured, 404) hides it.
  const { data: hmrc } = useData<HmrcStatus | null>("hmrc-status", () =>
    api
      .get<{ data: HmrcStatus }>("/hmrc/status")
      .then((r) => r.data)
      .catch(() => null)
  );

  return (
    <>
      <PageHeader title="Tax" />
      <div className="mc-tax-page">
        <TaxReadinessCard mode="work" hub />

        <div className="mc-tax-groups">
          <SettingsGroup title="Your tax return">
            <SettingsRow icon="calculator-outline" label="Self Assessment" hint="Your figures, box by box" href="/dashboard/tax/self-assessment" />
            {!isCompanyDriver && (
              <SettingsRow icon="calendar-outline" label="Tax payment plan" hint="What to pay and when" href="/dashboard/tax/payment-plan" />
            )}
            {isGigDriver && (
              <SettingsRow icon="help-circle-outline" label="First Self Assessment?" hint="A short guide to filing for the first time" href="/dashboard/tax/first-return" />
            )}
            {isGigDriver && (
              <SettingsRow icon="checkmark-circle-outline" label="Ready for 31 January?" hint="A checklist for your return" href="/dashboard/tax/checklist" />
            )}
          </SettingsGroup>

          <SettingsGroup title="Records">
            <SettingsRow icon="download-outline" label="Tax exports" hint="PDF, CSV and odometer log" href="/dashboard/tax/exports" badge="pro" />
            <SettingsRow icon="shield-checkmark-outline" label="Mileage certificate" hint="Share your miles with an insurer or employer" href="/dashboard/tax/certificate" badge="pro" />
            <SettingsRow icon="swap-vertical-outline" label="Check against HMRC's figures" hint="Compare what platforms reported" href="/dashboard/tax/reconciliation" />
            <SettingsRow icon="people-outline" label="Your accountant" hint="Details and sharing" href="/dashboard/tax/accountant" />
            {hmrc?.connected && (
              <SettingsRow icon="document-text-outline" label="Quarterly Self Assessment" hint="Connected to the test service" href="/dashboard/tax/mtd" />
            )}
          </SettingsGroup>

          {isEmployee && (
            <SettingsGroup title="Claims (employee)">
              <SettingsRow icon="cash-outline" label="Mileage Allowance Relief" hint="Claim back what your employer didn't pay" href="/dashboard/tax/mileage-relief" />
            </SettingsGroup>
          )}

          <SettingsGroup title="Settings">
            <SettingsRow icon="settings-outline" label="Work and tax" hint="Work type, employer rate, other income" href="/dashboard/settings/work-tax" />
          </SettingsGroup>
        </div>
      </div>
    </>
  );
}
