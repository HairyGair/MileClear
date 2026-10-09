"use client";

import Link from "next/link";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { resolveAvatarFile } from "../../../lib/avatars";
import { useData } from "../../../lib/dashboard/useData";
import { useMe } from "../../../lib/dashboard/useMe";
import { Button } from "../../../components/dashboard/kit/Button";
import { PageHeader } from "../../../components/dashboard/kit/PageHeader";
import { SettingsGroup, SettingsRow } from "../../../components/dashboard/kit/Settings";

// The app's More screen, group for group. Rows show or hide by who the driver is.
export default function MorePage() {
  const { user, isPro, isAdmin, isCompanyDriver, team, mode } = useMe();
  const { logout } = useAuth();
  const emsee = useData("assistant-status", () => api.get<{ available?: boolean }>("/assistant/status"));
  const name = user?.displayName || user?.fullName || user?.email || "Your profile";
  const file = resolveAvatarFile(user?.avatarId);
  const proBadge = isPro ? undefined : "pro";
  const money = !isCompanyDriver;

  return (
    <>
      <PageHeader title="More" />
      <Link href="/dashboard/profile" className="mc-card mc-card--link mc-profilecard">
        <span className="mc-profilecard__avatar">
          { }
          {file ? <img src={file} alt="" /> : name.charAt(0).toUpperCase()}
        </span>
        <span className="mc-row__text">
          <span className="mc-row__label">{name}</span>
          <span className="mc-row__hint">{user?.email}</span>
        </span>
        <span className={isPro ? "mc-pro" : "mc-status"}>{isPro ? "Pro" : "Free"}</span>
      </Link>

      <div className="mc-more-grid">
        <div>
          <SettingsGroup title="Your driving">
            <SettingsRow icon="car-outline" label="Vehicles" hint="Your cars, MOT and tax dates" href="/dashboard/vehicles" />
            <SettingsRow icon="speedometer-outline" label="Odometer log" hint="Start and end readings for each day" href="/dashboard/odometer" />
            <SettingsRow icon="time-outline" label="Shifts" hint="Your work sessions" href="/dashboard/shifts" />
            <SettingsRow icon="location-outline" label="Saved places" hint="Home, work and other places you go" href="/dashboard/places" />
            <SettingsRow icon="water-outline" label="Fuel" hint="Fill-ups and prices near you" href="/dashboard/fuel" />
            <SettingsRow icon="trophy-outline" label="Achievements" hint="Your badges" href="/dashboard/achievements" />
            {mode === "work" ? (
              <SettingsRow icon="stats-chart-outline" label="Insights" hint="Your numbers and trends" href="/dashboard/insights" />
            ) : (
              <SettingsRow icon="calculator-outline" label="Tax" hint="Self Assessment and exports" href="/dashboard/tax" />
            )}
            <SettingsRow icon="warning-outline" label="Road alerts" hint="Closures and delays on your usual roads" href="/dashboard/road-alerts" />
          </SettingsGroup>

          <SettingsGroup title="Money">
            {money && <SettingsRow icon="cash-outline" label="Earnings" hint="What you were paid" href="/dashboard/earnings" />}
            <SettingsRow icon="receipt-outline" label="Expenses" hint="Parking, tolls and other costs" href="/dashboard/expenses" />
            {money && <SettingsRow icon="document-text-outline" label="Invoices" hint="Bill your clients" href="/dashboard/invoices" />}
            {money && <SettingsRow icon="card-outline" label="Link a bank" hint="Bring in your earnings automatically" href="/dashboard/bank" badge={proBadge} />}
            {money && <SettingsRow icon="file-tray-full-outline" label="Bank inbox" hint="Payments waiting to be sorted" href="/dashboard/bank/inbox" badge={proBadge} />}
          </SettingsGroup>
        </div>

        <div>
          <SettingsGroup title="Tools">
            <SettingsRow icon="shield-checkmark-outline" label="Ticket defender" hint="Check a fine against your trips" href="/dashboard/ticket-defender" badge={proBadge} />
            {emsee.data?.available === true && (
              <SettingsRow icon="chatbubble-ellipses-outline" label="EmSee" hint="Ask about MileClear" href="/dashboard/emsee" badge={proBadge} />
            )}
            <SettingsRow icon="calendar-outline" label="Work schedule" hint="Your working days and hours" href="/dashboard/work-schedule" />
            {team?.role === "admin" && (
              <SettingsRow icon="people-outline" label="Milesheet" hint="Your company's team portal" href="/milesheet/portal" />
            )}
          </SettingsGroup>

          <SettingsGroup title="Help and settings">
            <SettingsRow icon="settings-outline" label="Settings" hint="Notifications, work and tax, your data" href="/dashboard/settings" />
            <SettingsRow icon="help-circle-outline" label="Help and tutorials" hint="How MileClear works" href="/dashboard/help" />
            <SettingsRow icon="chatbubble-outline" label="Feedback" hint="Ideas and problems" href="/dashboard/feedback" />
            <SettingsRow icon="gift-outline" label="Invite a friend, get Pro free" href="/dashboard/invite" />
            <SettingsRow icon="logo-discord" label="Join us on Discord" hint="Chat with other drivers" href="/dashboard/settings/community" />
          </SettingsGroup>

          {isAdmin && (
            <SettingsGroup title="Admin">
              <SettingsRow icon="construct-outline" label="Admin panel" href="/dashboard/admin" />
            </SettingsGroup>
          )}

          <div className="mc-logout">
            <Button
              variant="ghost"
              icon="log-out-outline"
              fullWidth
              onClick={() => {
                logout().finally(() => {
                  window.location.href = "/login";
                });
              }}
            >
              Log out
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
