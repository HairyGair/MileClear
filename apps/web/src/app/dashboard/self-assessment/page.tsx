"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../lib/auth-context";
import { api, fetchWithAuth } from "../../../lib/api";
import { PageHeader } from "../../../components/dashboard/PageHeader";
import { LoadingSkeleton } from "../../../components/ui/LoadingSkeleton";
import { getTaxYear, formatPence, formatMiles, SA103_BOXES, SA103_GUIDANCE } from "@mileclear/shared";

// ── Types ─────────────────────────────────────────────────────────────────

interface PlatformRow {
  platform: string;
  totalPence: number;
  count: number;
}

interface VehicleRow {
  vehicleId: string;
  make: string;
  model: string;
  vehicleType: string;
  businessMiles: number;
  personalMiles: number;
  totalMiles: number;
  deductionPence: number;
}

interface ExpenseRow {
  category: string;
  label: string;
  totalPence: number;
  deductibleWithMileage: boolean;
}

interface TaxBandRow {
  band: string;
  type: string;
  ratePct: number | null;
  amountPence: number;
  description: string;
}

interface SelfAssessmentSummary {
  taxYear: string;
  totalEarningsPence: number;
  platformBreakdown: PlatformRow[];
  totalMiles: number;
  businessMiles: number;
  personalMiles: number;
  mileageDeductionPence: number;
  vehicleBreakdown: VehicleRow[];
  expenseBreakdown: ExpenseRow[];
  allowableExpensesPence: number;
  nonMileageExpensesPence: number;
  taxableProfitPence: number;
  taxBandBreakdown: TaxBandRow[];
  totalTaxPence: number;
  effectiveRatePercent: number;
  sa103Values: Record<string, number>;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function generateTaxYears(count: number): string[] {
  const current = getTaxYear(new Date());
  const startYear = parseInt(current.split("-")[0], 10);
  return Array.from({ length: count }, (_, i) => {
    const y = startYear - i;
    return `${y}-${String(y + 1).slice(2)}`;
  });
}

const STEPS = [
  "Tax Year",
  "Income",
  "Mileage",
  "Expenses",
  "Tax Estimate",
  "SA103 Guide",
] as const;

function platformLabel(tag: string): string {
  const MAP: Record<string, string> = {
    uber: "Uber / Uber Eats",
    deliveroo: "Deliveroo",
    just_eat: "Just Eat",
    amazon_flex: "Amazon Flex",
    stuart: "Stuart",
    gophr: "Gophr",
    dpd: "DPD",
    yodel: "Yodel",
    evri: "Evri",
    other: "Other",
  };
  return MAP[tag] ?? tag;
}

function taxTypeBadge(type: string): string {
  if (type === "income_tax") return "Income Tax";
  if (type === "class2_ni") return "Class 2 NI";
  if (type === "class4_ni") return "Class 4 NI";
  return type;
}

// ── Step components ───────────────────────────────────────────────────────

interface StepProps {
  summary: SelfAssessmentSummary;
  taxYear: string;
  onDownload: () => void;
  downloading: boolean;
}

function StepIncome({ summary }: Pick<StepProps, "summary">) {
  return (
    <div className="sa-step-content">
      <h2 className="sa-step-content__title">Income Summary</h2>
      <p className="sa-step-content__desc">
        Your total gross income from all platforms in {summary.taxYear}. This is your turnover for Box 9 of SA103.
      </p>
      <div className="sa-hero-value">
        <span className="sa-hero-value__label">Total Earnings</span>
        <span className="sa-hero-value__amount">{formatPence(summary.totalEarningsPence)}</span>
      </div>
      {summary.platformBreakdown.length > 0 && (
        <div className="table-wrap" style={{ marginTop: "1.5rem", border: "none", background: "transparent" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Trips / Entries</th>
                <th style={{ textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {summary.platformBreakdown.map((row) => (
                <tr key={row.platform}>
                  <td style={{ fontWeight: 500 }}>{platformLabel(row.platform)}</td>
                  <td>{row.count}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{formatPence(row.totalPence)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: "2px solid var(--border-default)" }}>
                <td style={{ fontWeight: 700 }}>Total</td>
                <td style={{ fontWeight: 700 }}>
                  {summary.platformBreakdown.reduce((s, r) => s + r.count, 0)}
                </td>
                <td style={{ textAlign: "right", fontWeight: 700, color: "var(--amber-400)" }}>
                  {formatPence(summary.totalEarningsPence)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {summary.platformBreakdown.length === 0 && (
        <p className="sa-empty">No earnings recorded for {summary.taxYear}. Add earnings from the Earnings page.</p>
      )}
    </div>
  );
}

function StepMileage({ summary }: Pick<StepProps, "summary">) {
  const multiVehicle = summary.vehicleBreakdown.length > 1;
  return (
    <div className="sa-step-content">
      <h2 className="sa-step-content__title">Mileage Deduction</h2>
      <p className="sa-step-content__desc">
        MileClear uses the HMRC simplified mileage method - 45p per mile for the first 10,000 business miles, 25p thereafter. This figure goes in Box 46 of SA103.
      </p>
      <div className="sa-hero-value">
        <span className="sa-hero-value__label">Mileage Deduction (Box 46)</span>
        <span className="sa-hero-value__amount">{formatPence(summary.mileageDeductionPence)}</span>
      </div>
      <div className="stats-grid" style={{ marginTop: "1.5rem", marginBottom: "1.5rem" }}>
        <div className="stat-card">
          <div className="stat-card__value stat-card__value--amber">{formatMiles(summary.businessMiles)} mi</div>
          <div className="stat-card__label">Business Miles</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value">{formatMiles(summary.personalMiles)} mi</div>
          <div className="stat-card__label">Personal Miles</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value">{formatMiles(summary.totalMiles)} mi</div>
          <div className="stat-card__label">Total Miles</div>
        </div>
      </div>
      {multiVehicle && (
        <div className="table-wrap" style={{ border: "none", background: "transparent" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Business</th>
                <th>Personal</th>
                <th style={{ textAlign: "right" }}>Deduction</th>
              </tr>
            </thead>
            <tbody>
              {summary.vehicleBreakdown.map((v) => (
                <tr key={v.vehicleId}>
                  <td style={{ fontWeight: 500 }}>{v.make} {v.model}</td>
                  <td>{formatMiles(v.businessMiles)} mi</td>
                  <td>{formatMiles(v.personalMiles)} mi</td>
                  <td style={{ textAlign: "right", fontWeight: 600, color: "var(--amber-400)" }}>
                    {formatPence(v.deductionPence)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="sa-note">
        You are using the simplified mileage method (Box 46). You cannot also claim actual vehicle costs in Box 25 for the same vehicle.
      </div>
    </div>
  );
}

function StepExpenses({ summary }: Pick<StepProps, "summary">) {
  const claimable = summary.expenseBreakdown.filter((e) => e.deductibleWithMileage && e.totalPence > 0);
  const notClaimable = summary.expenseBreakdown.filter((e) => !e.deductibleWithMileage && e.totalPence > 0);

  return (
    <div className="sa-step-content">
      <h2 className="sa-step-content__title">Allowable Expenses</h2>
      <p className="sa-step-content__desc">
        Expenses you can claim alongside the mileage deduction. Parking, tolls, phone bills and equipment go in Box 27. Vehicle running costs (fuel, insurance) cannot be claimed when using simplified mileage.
      </p>
      <div className="sa-hero-value">
        <span className="sa-hero-value__label">Claimable Expenses (Box 27)</span>
        <span className="sa-hero-value__amount">{formatPence(summary.allowableExpensesPence)}</span>
      </div>

      {claimable.length > 0 && (
        <>
          <h3 className="sa-subsection-title">Claimable alongside mileage</h3>
          <div className="table-wrap" style={{ border: "none", background: "transparent" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {claimable.map((e) => (
                  <tr key={e.category}>
                    <td>{e.label}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{formatPence(e.totalPence)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid var(--border-default)" }}>
                  <td style={{ fontWeight: 700 }}>Subtotal</td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: "var(--amber-400)" }}>
                    {formatPence(summary.allowableExpensesPence)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {notClaimable.length > 0 && (
        <>
          <h3 className="sa-subsection-title" style={{ marginTop: "1.5rem" }}>
            Not claimable with mileage method
          </h3>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
            These costs are tracked for your records but cannot be deducted when using simplified mileage.
          </p>
          <div className="table-wrap" style={{ border: "none", background: "transparent", opacity: 0.6 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {notClaimable.map((e) => (
                  <tr key={e.category}>
                    <td>{e.label}</td>
                    <td style={{ textAlign: "right" }}>{formatPence(e.totalPence)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {claimable.length === 0 && notClaimable.length === 0 && (
        <p className="sa-empty">No expenses recorded for {summary.taxYear}. Log expenses from the Expenses page.</p>
      )}
    </div>
  );
}

function StepTaxEstimate({ summary }: Pick<StepProps, "summary">) {
  const incomeTax = summary.taxBandBreakdown.filter((b) => b.type === "income_tax");
  const niRows = summary.taxBandBreakdown.filter((b) => b.type !== "income_tax");

  return (
    <div className="sa-step-content">
      <h2 className="sa-step-content__title">Tax Estimate</h2>
      <p className="sa-step-content__desc">
        An estimated breakdown of your Income Tax and National Insurance for {summary.taxYear}. These are rough figures - your actual liability depends on other income, reliefs, and allowances.
      </p>

      {/* Taxable income calculation */}
      <div className="sa-calc-block">
        <div className="sa-calc-row">
          <span>Total earnings</span>
          <span>{formatPence(summary.totalEarningsPence)}</span>
        </div>
        <div className="sa-calc-row sa-calc-row--deduct">
          <span>Mileage deduction (Box 46)</span>
          <span>- {formatPence(summary.mileageDeductionPence)}</span>
        </div>
        <div className="sa-calc-row sa-calc-row--deduct">
          <span>Allowable expenses (Box 27)</span>
          <span>- {formatPence(summary.allowableExpensesPence)}</span>
        </div>
        <div className="sa-calc-row sa-calc-row--total">
          <span>Taxable profit</span>
          <span>{formatPence(summary.taxableProfitPence)}</span>
        </div>
      </div>

      {/* Income tax bands */}
      {incomeTax.filter((b) => b.amountPence > 0).length > 0 && (
        <>
          <h3 className="sa-subsection-title" style={{ marginTop: "1.5rem" }}>Income Tax</h3>
          <div className="table-wrap" style={{ border: "none", background: "transparent" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Band</th>
                  <th>Rate</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {incomeTax.map((b) => (
                  <tr key={b.band}>
                    <td>{b.band}</td>
                    <td>{b.ratePct !== null ? `${Math.round(b.ratePct * 100)}%` : "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: b.amountPence > 0 ? 600 : 400 }}>
                      {b.amountPence > 0 ? formatPence(b.amountPence) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* NI rows */}
      {niRows.filter((b) => b.amountPence > 0).length > 0 && (
        <>
          <h3 className="sa-subsection-title" style={{ marginTop: "1.25rem" }}>National Insurance</h3>
          <div className="table-wrap" style={{ border: "none", background: "transparent" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Rate</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {niRows.map((b) => (
                  <tr key={b.band}>
                    <td>{taxTypeBadge(b.type)}</td>
                    <td>{b.ratePct !== null ? `${Math.round(b.ratePct * 100)}%` : "Fixed"}</td>
                    <td style={{ textAlign: "right", fontWeight: b.amountPence > 0 ? 600 : 400 }}>
                      {b.amountPence > 0 ? formatPence(b.amountPence) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="sa-hero-value" style={{ marginTop: "1.5rem" }}>
        <span className="sa-hero-value__label">Estimated Total Tax</span>
        <span className="sa-hero-value__amount">{formatPence(summary.totalTaxPence)}</span>
        {summary.effectiveRatePercent > 0 && (
          <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
            Effective rate: {summary.effectiveRatePercent.toFixed(1)}%
          </span>
        )}
      </div>

      <div className="sa-disclaimer" style={{ marginTop: "1.5rem" }}>
        {SA103_GUIDANCE.disclaimer}
      </div>
    </div>
  );
}

function StepSa103Guide({ summary, onDownload, downloading }: StepProps) {
  // Key boxes to highlight
  const keyBoxNums = new Set([9, 27, 46]);

  const relevantBoxes = SA103_BOXES.filter((box) => {
    const val = summary.sa103Values[box.dataKey];
    return val !== undefined && val > 0;
  });

  return (
    <div className="sa-step-content">
      <h2 className="sa-step-content__title">SA103 Form Guide</h2>
      <p className="sa-step-content__desc">
        The boxes below map directly to the HMRC SA103 Self-employment supplementary pages. Use these values when completing your return online at gov.uk/self-assessment or with your accountant.
      </p>

      <div className="sa-disclaimer" style={{ marginBottom: "1.5rem" }}>
        {SA103_GUIDANCE.disclaimer}
      </div>

      <div className="sa-boxes">
        {relevantBoxes.map((box) => {
          const val = summary.sa103Values[box.dataKey] ?? 0;
          const isKey = keyBoxNums.has(box.box);
          return (
            <div
              key={box.box}
              className={`sa-box${isKey ? " sa-box--key" : ""}`}
            >
              <div className="sa-box__header">
                <span className="sa-box__num">Box {box.box}</span>
                {isKey && <span className="sa-box__key-badge">Key Box</span>}
              </div>
              <div className="sa-box__label">{box.label}</div>
              <div className="sa-box__desc">{box.description}</div>
              <div className="sa-box__value">{formatPence(val)}</div>
            </div>
          );
        })}

        {relevantBoxes.length === 0 && (
          <p className="sa-empty">Complete the earlier steps to see your SA103 box values.</p>
        )}
      </div>

      <div style={{ marginTop: "2rem" }}>
        <button
          className="btn btn--primary"
          onClick={onDownload}
          disabled={downloading}
          aria-busy={downloading}
        >
          {downloading ? "Generating..." : "Download PDF Summary"}
        </button>
        <p style={{ marginTop: "0.75rem", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
          Downloads your HMRC Self-Assessment PDF report for {summary.taxYear}.
        </p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function SelfAssessmentPage() {
  const { user } = useAuth();
  const taxYears = generateTaxYears(4);

  const [step, setStep] = useState(0); // 0 = year picker, 1-5 = wizard steps
  const [selectedYear, setSelectedYear] = useState(taxYears[1] ?? taxYears[0]); // default to last completed
  const [summary, setSummary] = useState<SelfAssessmentSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Premium gate
  if (!user?.isPremium) {
    return (
      <>
        <PageHeader title="Self Assessment Guide" subtitle="Step-by-step HMRC SA103 walkthrough" />
        <div className="premium-gate">
          <div className="premium-gate__icon">&#128203;</div>
          <h2 className="premium-gate__title">Upgrade to Pro</h2>
          <p className="premium-gate__text">
            The Self Assessment Wizard - with income breakdowns, mileage deductions, expense mapping and SA103 box values - is available with a MileClear Pro subscription.
          </p>
          <a href="/dashboard/settings" className="btn btn--primary">Manage Subscription</a>
        </div>
      </>
    );
  }

  const fetchSummary = useCallback(async (year: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: SelfAssessmentSummary }>(
        `/self-assessment/summary?taxYear=${encodeURIComponent(year)}`
      );
      setSummary(res.data);
    } catch (err: any) {
      setError(err.message ?? "Failed to load summary");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch when moving past step 0
  useEffect(() => {
    if (step >= 1 && !summary) {
      fetchSummary(selectedYear);
    }
  }, [step, selectedYear, summary, fetchSummary]);

  const handleYearNext = () => {
    setSummary(null); // reset if year changes
    setStep(1);
  };

  const handleYearChange = (year: string) => {
    setSelectedYear(year);
    setSummary(null);
  };

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const filename = `mileclear-self-assessment-${selectedYear}-${date}.pdf`;
      const res = await fetchWithAuth(
        `/exports/self-assessment?taxYear=${encodeURIComponent(selectedYear)}`
      );
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // silently fail - user can retry
    } finally {
      setDownloading(false);
    }
  }, [selectedYear]);

  const totalSteps = STEPS.length; // 6

  const canGoNext = step < totalSteps - 1;
  const canGoBack = step > 0;

  const progressPct = step === 0 ? 0 : ((step) / (totalSteps - 1)) * 100;

  return (
    <>
      <PageHeader
        title="Self Assessment Guide"
        subtitle="Step-by-step HMRC SA103 walkthrough for self-employed drivers"
      />

      {/* Step indicator */}
      <div className="sa-wizard">
        <div className="sa-step-indicator" role="navigation" aria-label="Wizard steps">
          <div className="sa-step-indicator__bar" role="progressbar" aria-valuenow={Math.round(progressPct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="sa-step-indicator__fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="sa-step-indicator__dots">
            {STEPS.map((label, i) => (
              <button
                key={label}
                className={`sa-step-indicator__dot${i === step ? " sa-step-indicator__dot--active" : ""}${i < step ? " sa-step-indicator__dot--done" : ""}`}
                onClick={() => {
                  if (i <= step || (i === step + 1 && summary)) {
                    if (i > 0 && !summary) return;
                    setStep(i);
                  }
                }}
                aria-current={i === step ? "step" : undefined}
                aria-label={`Step ${i + 1}: ${label}`}
                title={label}
              >
                {i < step ? (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                    <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span>{i + 1}</span>
                )}
              </button>
            ))}
          </div>
          <div className="sa-step-indicator__label">
            Step {step + 1} of {totalSteps} - {STEPS[step]}
          </div>
        </div>

        {/* Step 0: Year selection */}
        {step === 0 && (
          <div className="sa-step-content">
            <h2 className="sa-step-content__title">Select Tax Year</h2>
            <p className="sa-step-content__desc">
              Choose the tax year you want to prepare your Self Assessment for. The UK tax year runs from 6 April to 5 April the following year.
            </p>
            <div className="sa-year-select">
              {taxYears.map((year) => (
                <button
                  key={year}
                  className={`sa-year-btn${selectedYear === year ? " sa-year-btn--active" : ""}`}
                  onClick={() => handleYearChange(year)}
                  aria-pressed={selectedYear === year}
                >
                  {year}
                </button>
              ))}
            </div>
            <p style={{ marginTop: "1rem", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              Selected: {selectedYear} (6 April {selectedYear.split("-")[0]} to 5 April {parseInt(selectedYear.split("-")[0]) + 1})
            </p>
          </div>
        )}

        {/* Steps 1-5: Data steps */}
        {step > 0 && loading && (
          <LoadingSkeleton variant="card" count={3} style={{ margin: "1.5rem 0" }} />
        )}

        {step > 0 && error && (
          <div className="alert alert--error" style={{ margin: "1.5rem 0" }}>
            {error}
            <button
              className="btn btn--ghost"
              style={{ marginLeft: "1rem" }}
              onClick={() => fetchSummary(selectedYear)}
            >
              Retry
            </button>
          </div>
        )}

        {step > 0 && !loading && !error && summary && (
          <>
            {step === 1 && <StepIncome summary={summary} />}
            {step === 2 && <StepMileage summary={summary} />}
            {step === 3 && <StepExpenses summary={summary} />}
            {step === 4 && <StepTaxEstimate summary={summary} />}
            {step === 5 && (
              <StepSa103Guide
                summary={summary}
                taxYear={selectedYear}
                onDownload={handleDownload}
                downloading={downloading}
              />
            )}
          </>
        )}

        {/* Navigation */}
        <div className="sa-nav">
          {canGoBack ? (
            <button className="btn btn--secondary" onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          ) : (
            <div />
          )}
          {canGoNext && (
            <button
              className="btn btn--primary"
              onClick={() => (step === 0 ? handleYearNext() : setStep((s) => s + 1))}
              disabled={step > 0 && (loading || !summary)}
            >
              {step === 0 ? "Next" : loading ? "Loading..." : "Next"}
            </button>
          )}
          {!canGoNext && step === totalSteps - 1 && (
            <button className="btn btn--secondary" onClick={() => setStep(0)}>
              Start Over
            </button>
          )}
        </div>
      </div>
    </>
  );
}
