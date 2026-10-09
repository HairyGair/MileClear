"use client";

import { PageHeader, SettingsGroup, SettingsRow, useMe } from "@/components/dashboard/kit";
import styles from "@/components/dashboard/settings/settings.module.css";

// The Settings hub: the app's settings screen, row for row, minus app lock
// (that lives on the phone). The first two rows are the ones email links land on.
export default function SettingsPage() {
  const { isPro, premiumSource, team, isCompanyDriver } = useMe();
  const planHint = !isPro ? "Free" : premiumSource === "team" && team ? `Pro through ${team.orgName}` : "Pro";

  return (
    <>
      <PageHeader title="Settings" back={{ href: "/dashboard/more", label: "More" }} />
      <div className={styles.page}>
        <SettingsGroup>
          <SettingsRow icon="card-outline" label="Your plan" hint={planHint} href="/dashboard/settings/plan" />
          <SettingsRow icon="gift-outline" label="Invite a friend, get Pro free" href="/dashboard/invite" />
        </SettingsGroup>

        <SettingsGroup title="Preferences">
          <SettingsRow icon="eye-outline" label="What you see" hint="Work, Personal or both" href="/dashboard/settings/preferences" />
        </SettingsGroup>

        <SettingsGroup title="Tracking and places">
          <SettingsRow icon="navigate-outline" label="Tracking" hint="Set on your phone" href="/dashboard/settings/tracking" />
          <SettingsRow icon="location-outline" label="Saved places" href="/dashboard/places" />
          <SettingsRow icon="filter-outline" label="Classification rules" hint="Set on your phone" href="/dashboard/settings/tracking#rules" />
          <SettingsRow icon="calendar-outline" label="Work schedule" hint="Set on your phone" href="/dashboard/work-schedule" />
        </SettingsGroup>

        <SettingsGroup title="Work and tax">
          <SettingsRow icon="briefcase-outline" label="Work and tax" hint="Work type, employer rate, other income" href="/dashboard/settings/work-tax" />
          {!isCompanyDriver && (
            <SettingsRow icon="business-outline" label="Business profile" hint="Name, logo and bank details for invoices" href="/dashboard/settings/business-profile" />
          )}
          <SettingsRow icon="people-outline" label="Your accountant" href="/dashboard/tax/accountant" />
        </SettingsGroup>

        <SettingsGroup title="Notifications">
          <SettingsRow icon="notifications-outline" label="Notifications and emails" href="/dashboard/settings/notifications" />
        </SettingsGroup>

        <SettingsGroup title="Your data">
          <SettingsRow icon="shield-checkmark-outline" label="Your data" hint="Download or delete" href="/dashboard/settings/data" />
          <SettingsRow icon="download-outline" label="Tax exports" href="/dashboard/tax/exports" />
        </SettingsGroup>

        <SettingsGroup title="Community">
          <SettingsRow icon="logo-discord" label="Discord" href="/dashboard/settings/community" />
        </SettingsGroup>

        <SettingsGroup title="Help">
          <SettingsRow icon="help-circle-outline" label="Help and tutorials" href="/dashboard/help" />
          <SettingsRow icon="chatbubble-outline" label="Feedback" hint="Ideas and problems" href="/dashboard/feedback" />
        </SettingsGroup>

        <SettingsGroup title="Legal">
          <SettingsRow icon="document-text-outline" label="Privacy policy" href="/privacy" />
          <SettingsRow icon="document-text-outline" label="Terms" href="/terms" />
        </SettingsGroup>
      </div>
    </>
  );
}
