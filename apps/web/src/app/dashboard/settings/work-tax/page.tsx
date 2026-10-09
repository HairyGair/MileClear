"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Card,
  MoneyField,
  NumberField,
  PageHeader,
  SelectField,
  SettingsGroup,
  SettingsRow,
  useData,
  useMe,
  useToast,
} from "@/components/dashboard/kit";
import { api } from "@/lib/api";
import { errMsg } from "@/components/dashboard/settings/util";
import styles from "@/components/dashboard/settings/settings.module.css";

type WorkType = "gig" | "employee" | "both";

const WORK_TYPES = [
  { value: "gig", label: "Self-employed (gig, delivery or courier)" },
  { value: "employee", label: "Employee (my employer pays me for business miles)" },
  { value: "both", label: "Both" },
];

const TAX_BASIS = [
  { value: "cash", label: "Cash basis (count income when I'm paid)" },
  { value: "accruals", label: "Accruals (count income when I invoice)" },
];

// Work and tax: the same fields as the app's Work & Tax screen.
export default function WorkTaxPage() {
  const { user, isCompanyDriver, refresh } = useMe();
  const { show } = useToast();
  const mtd = useData("hmrc-status", () => api.get<{ data?: { connected?: boolean } }>("/hmrc/status"));

  const [workType, setWorkType] = useState<WorkType>("gig");
  const [rate, setRate] = useState("");
  const [rateAfter, setRateAfter] = useState("");
  const [otherIncome, setOtherIncome] = useState<number | null>(null);
  const [paye, setPaye] = useState<number | null>(null);
  const [goal, setGoal] = useState<number | null>(null);
  const [basis, setBasis] = useState("cash");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = user?.id;
  useEffect(() => {
    if (!user) return;
    setWorkType((user.workType ?? "gig") as WorkType);
    setRate(user.employerMileageRatePence != null ? String(user.employerMileageRatePence) : "");
    setRateAfter(user.employerMileageRatePenceAfter10k != null ? String(user.employerMileageRatePenceAfter10k) : "");
    setOtherIncome(user.otherAnnualIncomePence && user.otherAnnualIncomePence > 0 ? user.otherAnnualIncomePence : null);
    setPaye(user.payeAnnualPaidTaxPence && user.payeAnnualPaidTaxPence > 0 ? user.payeAnnualPaidTaxPence : null);
    setGoal(user.weeklyEarningsGoalPence && user.weeklyEarningsGoalPence > 0 ? user.weeklyEarningsGoalPence : null);
    setBasis(user.taxBasis ?? "cash");
    setReady(true);
    // Load the form once per account. Typing must not be overwritten by a profile refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const showEmployee = workType === "employee" || workType === "both";
  const showGig = (workType === "gig" || workType === "both") && !isCompanyDriver;

  async function save() {
    setError(null);
    const first = rate.trim() === "" ? null : parseInt(rate, 10);
    const after = rateAfter.trim() === "" ? null : parseInt(rateAfter, 10);
    if ((first !== null && first > 100) || (after !== null && after > 100)) {
      setError("Rates are in pence per mile, up to 100.");
      return;
    }
    setSaving(true);
    try {
      await api.patch("/user/profile", {
        workType,
        // The first rate is the master switch: clearing it clears the second too.
        employerMileageRatePence: first,
        employerMileageRatePenceAfter10k: first === null ? null : after,
        otherAnnualIncomePence: otherIncome,
        payeAnnualPaidTaxPence: paye,
        ...(showGig ? { weeklyEarningsGoalPence: goal, taxBasis: basis } : {}),
      });
      await refresh();
      show("Saved");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return <PageHeader title="Work and tax" back={{ href: "/dashboard/settings", label: "Settings" }} />;

  return (
    <>
      <PageHeader title="Work and tax" back={{ href: "/dashboard/settings", label: "Settings" }} />
      <div className={styles.page}>
        <Card>
          <div className={styles.fields}>
            <SelectField label="How do you work?" value={workType} onChange={(v) => setWorkType(v as WorkType)} options={WORK_TYPES} />

            {showEmployee && (
              <div className={styles.pair}>
                <NumberField
                  label="Employer rate per mile"
                  suffix="p"
                  decimals={false}
                  value={rate}
                  onChange={setRate}
                  hint="What your employer pays you per business mile."
                />
                <NumberField
                  label="Rate after 10,000 miles"
                  suffix="p"
                  decimals={false}
                  value={rateAfter}
                  onChange={setRateAfter}
                  hint="Leave blank if it doesn't change."
                />
              </div>
            )}

            <MoneyField
              label="Other income a year"
              value={otherIncome}
              onChange={setOtherIncome}
              hint="Pay from a job, a pension or rent. It sets the tax rate on your driving profit. Leave blank if you have none."
            />

            {showEmployee && (
              <MoneyField
                label="Tax already paid through PAYE"
                value={paye}
                onChange={setPaye}
                hint="Tax your employer took from your pay this tax year."
              />
            )}

            {showGig && (
              <>
                <MoneyField label="Weekly earnings goal" value={goal} onChange={setGoal} hint="Shown on Home. Leave blank for no goal." />
                <SelectField label="Tax basis" value={basis} onChange={setBasis} options={TAX_BASIS} />
              </>
            )}

            {error && <p className={styles.inlineError} role="alert">{error}</p>}
            <div className={styles.actions}>
              <Button variant="primary" loading={saving} onClick={() => void save()}>Save</Button>
            </div>
          </div>
        </Card>

        <SettingsGroup>
          {showEmployee && (
            <SettingsRow icon="cash-outline" label="Mileage Allowance Relief" hint="The gap between your employer's rate and the tax rate" href="/dashboard/tax/mileage-relief" />
          )}
          <SettingsRow icon="people-outline" label="Your accountant" href="/dashboard/tax/accountant" />
          {mtd.data?.data?.connected === true && (
            <SettingsRow icon="calculator-outline" label="Quarterly Self Assessment" href="/dashboard/tax/mtd" />
          )}
        </SettingsGroup>
      </div>
    </>
  );
}
