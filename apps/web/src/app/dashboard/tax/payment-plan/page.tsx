"use client";

import { useState } from "react";
import type { TaxPlan, TaxPlannerPayment } from "@mileclear/shared";
import { api } from "@/lib/api";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Figure,
  MoneyField,
  PageHeader,
  Skeleton,
  formatPence,
  useData,
  useMe,
  useToast,
} from "@/components/dashboard/kit";
import { longDate, messageOf } from "@/components/dashboard/tax/tax-utils";
import { daysAwayLabel, nextPayment, partHint, partLabel, previousTaxYear, sourceLabel } from "./copy";
import "@/components/dashboard/tax/tax.css";

function amountText(p: TaxPlannerPayment): string {
  if (p.amountPence == null) return "Not known yet";
  if (p.amountPence === 0) return "Nothing to pay";
  return formatPence(p.amountPence);
}

function AnswersForm({ plan, onSaved }: { plan: TaxPlan; onSaved: () => void }) {
  const toast = useToast();
  const [started, setStarted] = useState<string | null>(plan.settings.firstSelfEmployedTaxYear);
  const [bills, setBills] = useState<Record<string, number | null>>(() => {
    const init: Record<string, number | null> = {};
    for (const y of plan.years) init[y.taxYear] = plan.settings.bills[y.taxYear] ?? null;
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = plan.currentTaxYear;
  const lastYear = previousTaxYear(current);
  const yearBefore = previousTaxYear(lastYear);
  const choices = [
    { value: current, label: `This tax year (${current})` },
    { value: lastYear, label: `Last tax year (${lastYear})` },
    { value: "earlier", label: "Before that" },
  ];
  const billYears = plan.years.slice(0, 2).filter((y) => !(started && started !== "earlier" && y.taxYear < started));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, number | null> = {};
      for (const y of plan.years.slice(0, 2)) body[y.taxYear] = bills[y.taxYear] ?? null;
      await api.patch("/tax-planner/settings", { firstSelfEmployedTaxYear: started, bills: body });
      toast.show("Saved");
      onSaved();
    } catch (e) {
      setError(messageOf(e, "Couldn't save. Try again."));
    } finally {
      setSaving(false);
    }
  }

  const selected = started ?? "earlier";
  return (
    <Card title="Your answers">
      <form
        className="mc-tax-fields"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset className="mc-tax-radio">
          <legend>When did you start working for yourself?</legend>
          {plan.startAssumed && <p className="mc-tax-note">Until you say, we assume it was before {lastYear}.</p>}
          {choices.map((c) => (
            <label key={c.value}>
              <input
                type="radio"
                name="started"
                value={c.value}
                checked={selected === c.value}
                onChange={() => setStarted(c.value)}
              />
              {c.label}
            </label>
          ))}
        </fieldset>

        {billYears.map((y) => (
          <MoneyField
            key={`${y.taxYear}-${plan.settings.bills[y.taxYear] ?? "none"}`}
            label={`Your ${y.taxYear} bill, if you know it`}
            hint={
              y.taxYear === yearBefore
                ? `Sets what you have already paid on account towards ${lastYear}. It is on your ${y.taxYear} tax calculation from HMRC.`
                : "If you have filed, it is the total on your tax calculation from HMRC. Leave it blank to use MileClear's estimate."
            }
            value={bills[y.taxYear] ?? null}
            onChange={(v) => setBills((b) => ({ ...b, [y.taxYear]: v }))}
          />
        ))}

        {error && (
          <p className="mc-tax-error" role="alert">
            {error}
          </p>
        )}
        <div>
          <Button type="submit" variant="primary" loading={saving}>
            Save
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function PaymentPlanPage() {
  const { isCompanyDriver, teamReady } = useMe();
  const { data: plan, error, loading, reload } = useData<TaxPlan>(isCompanyDriver || !teamReady ? null : "tax-planner", () =>
    api.get<{ data: TaxPlan }>("/tax-planner").then((r) => r.data)
  );

  if (isCompanyDriver) {
    return (
      <>
        <PageHeader title="Tax payment plan" back={{ href: "/dashboard/tax", label: "Tax" }} />
        <EmptyState
          icon="business-outline"
          title="Not needed for company drivers"
          body="Your employer handles tax on your pay."
          action={{ label: "Back to Tax", href: "/dashboard/tax" }}
        />
      </>
    );
  }

  const next = plan ? nextPayment(plan.payments) : null;
  const lastListed = plan?.payments[plan.payments.length - 1]?.dueDate ?? null;

  return (
    <>
      <PageHeader title="Tax payment plan" back={{ href: "/dashboard/tax", label: "Tax" }}>
        How much you may have to pay HMRC, and when.
      </PageHeader>
      <div className="mc-tax-page">
        {(loading || !teamReady) && !plan && <Skeleton variant="card" count={3} />}
        {error && !plan && <ErrorState title="Couldn't load your payment plan" onRetry={reload} />}

        {plan && (
          <>
            {plan.mayNotApply && (
              <p className="mc-tax-note">
                You told us you drive as an employee, or you are in Personal mode, so this may not apply to you. It is here if you also do self-employed work.
              </p>
            )}

            <Card>
              {next == null ? (
                <Figure
                  size="lg"
                  label="Next payment to HMRC"
                  value="Nothing due"
                  sub={lastListed ? `From what you have recorded, nothing is due before ${longDate(lastListed)}.` : "From what you have recorded, nothing is due."}
                />
              ) : next.amountPence == null ? (
                <Figure
                  size="lg"
                  label={`Next payment to HMRC: ${longDate(next.dueDate)}`}
                  value="Not known yet"
                  sub="We need your earnings, or the bill HMRC gave you, to work this one out. Add either below."
                />
              ) : (
                <Figure
                  size="lg"
                  estimated
                  label={`Next payment to HMRC: ${daysAwayLabel(next.daysAway).toLowerCase()}`}
                  value={formatPence(next.amountPence)}
                  sub={`Due by ${longDate(next.dueDate)}`}
                />
              )}
              {next?.firstPaymentOnAccount && (
                <p className="mc-tax-text">
                  <strong>This is the big one.</strong> In your first year of payments on account, January takes the whole of last year&apos;s bill plus half of it again in advance for this year, so about one and a half times the bill at once.
                </p>
              )}
            </Card>

            {plan.weeklySetAsidePence != null && plan.weeklySetAsidePence > 0 && plan.coversTo && (
              <Card>
                <Figure
                  size="lg"
                  label="Put by each week"
                  value={formatPence(plan.weeklySetAsidePence)}
                  sub={`Starting this week, this covers every payment below by its date, up to ${longDate(plan.coversTo)}.${
                    plan.coversTo !== lastListed ? " It leaves out the later ones we can't work out yet." : ""
                  } If you have already put some by, you need less.`}
                />
              </Card>
            )}

            {plan.missingCurrentEarnings && (
              <Card tone="quiet">
                <p className="mc-tax-text">
                  You have not added any earnings for {plan.currentTaxYear}, so this year&apos;s tax can&apos;t be worked out.{" "}
                  <Button variant="link" size="sm" href="/dashboard/earnings">
                    Add earnings
                  </Button>
                </p>
              </Card>
            )}

            <div className="mc-tax-stack">
              <h2 className="mc-card__title">Payment dates</h2>
              {plan.payments.map((p) => (
                <Card key={p.dueDate}>
                  <div className="mc-tax-pay">
                    <div className="mc-tax-pay__top">
                      <div>
                        <p className="mc-tax-pay__date">{longDate(p.dueDate)}</p>
                        <p className="mc-tax-note">{daysAwayLabel(p.daysAway)}</p>
                      </div>
                      <p className="mc-tax-pay__amount">{amountText(p)}</p>
                    </div>
                    <ul className="mc-tax-kv">
                      {p.parts.map((part) => {
                        const hint = partHint(part);
                        return (
                          <li key={`${part.kind}-${part.taxYear}`}>
                            <span className="mc-tax-kv__label">
                              {partLabel(part)}
                              {hint && <span className="mc-tax-kv__sub">{hint}</span>}
                            </span>
                            <span className="mc-tax-kv__value">{part.amountPence == null ? "Not known" : formatPence(part.amountPence)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </Card>
              ))}
            </div>

            <Card title="Worked out from" padded={false}>
              <ul className="mc-tax-kv mc-tax-pad">
                {plan.years.map((y) => (
                  <li key={y.taxYear}>
                    <span className="mc-tax-kv__label">
                      {y.taxYear} bill
                      <span className="mc-tax-kv__sub">
                        {sourceLabel(y.source, y.taxYear)}
                        {y.partialYear ? ". You joined part-way through, so earlier months are not counted" : ""}
                      </span>
                    </span>
                    <span className="mc-tax-kv__value">{y.billPence == null ? "Not known" : formatPence(y.billPence)}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <AnswersForm plan={plan} onSaved={reload} />

            <p className="mc-tax-note">
              {plan.remindersOn
                ? "We remind you 14 days and 3 days before each payment with money due. You can turn this off in Settings, under notifications."
                : "Tax deadline reminders are off, so you won't get a nudge before these dates. Turn them on in Settings, under notifications."}
            </p>
            <p className="mc-tax-note">
              This is an estimate from what you have recorded in MileClear. Your real bill comes from HMRC after you file. It counts Income Tax and Class 4 National Insurance on your self-employed profit, after your mileage and expenses. Class 2 is treated as paid for most drivers, so it is not included. Student loan repayments and any other income you have not told MileClear about are not included either. This year&apos;s figure assumes you keep earning at your pace so far. If you expect to earn less, you can ask HMRC to reduce your payments on account.
            </p>
            <p>
              <a
                className="mc-textlink"
                href="https://www.gov.uk/understand-self-assessment-bill/payments-on-account"
                target="_blank"
                rel="noopener noreferrer"
              >
                Payments on account on GOV.UK (opens in a new tab)
              </a>
            </p>
          </>
        )}
      </div>
    </>
  );
}
