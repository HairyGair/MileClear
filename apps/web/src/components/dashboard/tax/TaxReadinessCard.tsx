"use client";

import Link from "next/link";
import type { TaxSnapshot } from "@mileclear/shared";
import { api } from "@/lib/api";
import { Card, CardError, EmptyState, ErrorState, Figure, Skeleton, formatPence, useData, useMe } from "@/components/dashboard/kit";
import { Derivation } from "./Derivation";
import { shortDateYear } from "./tax-utils";
import "./tax.css";

/**
 * Tax readiness. Every figure comes from GET /business-insights/tax-snapshot,
 * the same numbers as the app. Nothing here is worked out in the browser.
 *
 *   <TaxReadinessCard mode="work" />          Home: compact, null when empty
 *   <TaxReadinessCard mode="work" hub />      Tax hub: links row and empty state
 */
export function TaxReadinessCard({ mode, hub = false }: { mode: "work" | "personal"; hub?: boolean }) {
  const { isCompanyDriver, isGigDriver, isEmployee } = useMe();
  const enabled = mode === "work" || hub;
  const { data, error, loading, reload } = useData<TaxSnapshot>(enabled ? "tax-snapshot" : null, () =>
    api.get<{ data: TaxSnapshot }>("/business-insights/tax-snapshot").then((r) => r.data)
  );

  if (!enabled) return null;
  if (loading && !data) return <Skeleton variant="card" count={1} height={hub ? 200 : 160} />;
  if (error && !data) {
    return hub ? (
      <ErrorState title="Couldn't load your tax figures" onRetry={reload} size="card" />
    ) : (
      <Card title="Tax readiness">
        <CardError onRetry={reload} />
      </Card>
    );
  }
  if (!data) return null;

  const ytd = data.ytd;
  const nothingYet = ytd.mileageDeductionPence === 0 && ytd.grossEarningsPence === 0;
  if (nothingYet) {
    if (!hub) return null;
    return (
      <Card>
        <EmptyState
          size="card"
          icon="calculator-outline"
          title="Nothing to claim yet"
          body="Mark trips as Business and your tax figures show up here."
          action={{ label: "Go to trips", href: "/dashboard/trips" }}
        />
      </Card>
    );
  }

  // Employees and company drivers have no self-employed tax to estimate: the
  // headline is the mileage claim the snapshot returns.
  const claimOnly = isCompanyDriver || (isEmployee && !isGigDriver);
  const noEarnings = ytd.grossEarningsPence === 0;
  const showClaim = claimOnly || noEarnings;
  const milesFact = ytd.mileageDeductionDerivation.components.find((c) => /business miles/i.test(c.label));
  const days = data.daysToFilingDeadline;
  const left = data.setAsideThisWeek;
  const todo = data.readiness.items.filter((i) => !i.done);

  return (
    <Card
      title="Tax readiness"
      action={hub ? undefined : { label: "Tax", href: "/dashboard/tax" }}
      className="mc-tax-ready"
    >
      <div className="mc-tax-ready__top">
        <div>
          {showClaim ? (
            <Figure
              size="lg"
              label={`Your mileage claim so far, ${data.taxYear}`}
              value={formatPence(ytd.mileageDeductionPence)}
              sub={milesFact ? `${milesFact.label}: ${milesFact.value}` : undefined}
            />
          ) : ytd.estimatedTaxPence > 0 ? (
            <Figure
              size="lg"
              estimated
              label="You may owe about"
              value={formatPence(ytd.estimatedTaxPence)}
              sub={`for the ${data.taxYear} tax year, after your mileage claim and expenses`}
            />
          ) : (
            <Figure
              size="lg"
              label={`Tax for ${data.taxYear}`}
              value="Nothing to pay so far"
              sub="On what you have recorded, your profit is under the tax-free amount."
            />
          )}
        </div>
        {!showClaim && (
          <div className="mc-tax-ready__aside">
            <p className="mc-tax-text">Put by about</p>
            <p className="mc-num mc-tax-big">
              {formatPence(left.suggestedSetAsidePence)} <span className="mc-tax-text">this week</span>
            </p>
            <p className="mc-tax-note">
              {left.earningsLast7DaysPence > 0
                ? `${left.rateUsedPercent}% of ${formatPence(left.earningsLast7DaysPence)} earned this week`
                : "Nothing earned yet this week"}
              {left.accountantWeeklyFeePence ? `, plus ${formatPence(left.accountantWeeklyFeePence)} for your accountant` : ""}
            </p>
            <p className="mc-tax-note">
              Due {shortDateYear(data.filingDeadline)}
              {days >= 0 ? `, ${days} ${days === 1 ? "day" : "days"} to go` : `, ${-days} ${days === -1 ? "day" : "days"} ago`}
            </p>
          </div>
        )}
      </div>

      <dl className="mc-tax-facts">
        {milesFact && !showClaim && (
          <div>
            <dt>Business miles</dt>
            <dd>{milesFact.value}</dd>
          </div>
        )}
        {!showClaim && (
          <div>
            <dt>Mileage claim</dt>
            <dd>{formatPence(ytd.mileageDeductionPence)}</dd>
          </div>
        )}
        {!claimOnly && !noEarnings && (
          <div>
            <dt>Earnings</dt>
            <dd>{formatPence(ytd.grossEarningsPence)}</dd>
          </div>
        )}
        {!claimOnly && (ytd.allowableExpensesPence ?? 0) > 0 && (
          <div>
            <dt>Expenses</dt>
            <dd>{formatPence(ytd.allowableExpensesPence ?? 0)}</dd>
          </div>
        )}
      </dl>

      {!claimOnly && noEarnings && (
        <p className="mc-tax-text">
          Add what you were paid to see what you may owe.{" "}
          <Link href="/dashboard/earnings" className="mc-textlink">
            Add earnings
          </Link>
        </p>
      )}
      {!claimOnly && !noEarnings && data.nudges.earnings && (
        <p className="mc-tax-text">
          You have recorded business trips lately but no earnings.{" "}
          <Link href="/dashboard/earnings" className="mc-textlink">
            Add earnings
          </Link>
        </p>
      )}

      {todo.length > 0 && (
        <ul className="mc-tax-todo" aria-label="Still to do">
          {todo.map((i) => (
            <li key={i.id}>
              <strong>{i.label}.</strong> {i.hint}
            </li>
          ))}
        </ul>
      )}

      <details className="mc-tax-work">
        <summary>How we worked this out</summary>
        <div className="mc-tax-work__body">
          {!claimOnly && (
            <ul className="mc-tax-kv" aria-label="Estimate workings">
              <li>
                <span className="mc-tax-kv__label">
                  Earnings
                  {ytd.taxBasis && (
                    <span className="mc-tax-kv__sub">
                      {ytd.taxBasis === "cash" ? "Cash basis: invoices count when paid" : "Accruals basis: invoices count when sent"}
                    </span>
                  )}
                </span>
                <span className="mc-tax-kv__value">{formatPence(ytd.grossEarningsPence)}</span>
              </li>
              <li>
                <span className="mc-tax-kv__label">Mileage claim</span>
                <span className="mc-tax-kv__value">{formatPence(ytd.mileageDeductionPence)}</span>
              </li>
              {(ytd.allowableExpensesPence ?? 0) > 0 && (
                <li>
                  <span className="mc-tax-kv__label">Allowable expenses</span>
                  <span className="mc-tax-kv__value">{formatPence(ytd.allowableExpensesPence ?? 0)}</span>
                </li>
              )}
              <li className="is-total">
                <span className="mc-tax-kv__label">Taxable profit</span>
                <span className="mc-tax-kv__value">{formatPence(ytd.taxableProfitPence)}</span>
              </li>
              {ytd.grossTaxLiabilityPence !== undefined && (
                <li>
                  <span className="mc-tax-kv__label">Income Tax and National Insurance</span>
                  <span className="mc-tax-kv__value">{formatPence(ytd.grossTaxLiabilityPence)}</span>
                </li>
              )}
              {(ytd.payeAlreadyPaidPence ?? 0) > 0 && (
                <li>
                  <span className="mc-tax-kv__label">Already paid through your pay</span>
                  <span className="mc-tax-kv__value">{formatPence(ytd.payeAlreadyPaidPence ?? 0)}</span>
                </li>
              )}
              <li className="is-total">
                <span className="mc-tax-kv__label">
                  You may owe
                  <span className="mc-tax-kv__sub">{ytd.effectiveRatePercent}% of your earnings</span>
                </span>
                <span className="mc-tax-kv__value">{formatPence(ytd.estimatedTaxPence)}</span>
              </li>
            </ul>
          )}
          <Derivation title="Your mileage claim" d={ytd.mileageDeductionDerivation} />
          {!claimOnly && ytd.earningsDerivation && <Derivation title="Your earnings" d={ytd.earningsDerivation} />}
          <p className="mc-tax-note">An estimate from what you have recorded, not tax advice. Your real bill depends on your full return.</p>
        </div>
      </details>

      {hub && (
        <nav className="mc-tax-links" aria-label="Tax shortcuts">
          <Link href="/dashboard/tax/self-assessment" className="mc-textlink">
            Your return
          </Link>
          {!isCompanyDriver && (
            <Link href="/dashboard/tax/payment-plan" className="mc-textlink">
              Payment plan
            </Link>
          )}
          {isGigDriver && (
            <Link href="/dashboard/tax/first-return" className="mc-textlink">
              First return guide
            </Link>
          )}
          <Link href="/dashboard/tax/reconciliation" className="mc-textlink">
            Check figures
          </Link>
        </nav>
      )}
    </Card>
  );
}
