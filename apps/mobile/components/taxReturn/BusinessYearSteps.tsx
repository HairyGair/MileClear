// End of year: the two business-details steps HMRC wants before a tax return.
//   - Accounting method: show what HMRC holds, confirm it or change it.
//   - Accounting period: did one end in this tax year, and when?
// Each step loads its own data and tells the parent when it's done.
// Source: HMRC end-to-end service guide, see docs/hmrc-end-of-year-oct2026.md.

import { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DateTimePickerField } from "../DateTimePickerField";
import { Section, Body, Note, PrimaryButton, partStyles as s } from "./TaxReturnParts";
import {
  fetchAccountingType,
  updateAccountingType,
  fetchPeriodsOfAccount,
  sendPeriodsOfAccount,
  type AccountingType,
  type PeriodsAnswer,
  type PeriodsChoice,
} from "../../lib/api/hmrcTaxReturn";
import { isApiError } from "../../lib/api";
import { accountingTypeLabel, lateAccountingDateNote, periodAnswerLabel, toIsoDay } from "../../lib/tax/taxReturnCopy";
import { colors } from "../../lib/theme";

function errMsg(err: unknown, fallback: string): string {
  return isApiError(err) ? err.message : err instanceof Error ? err.message : fallback;
}

function Choice({
  selected,
  label,
  hint,
  onPress,
  disabled,
}: {
  selected: boolean;
  label: string;
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[s.choice, selected && s.choiceOn, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
    >
      <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={20} color={selected ? colors.amber : colors.text3} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.choiceText}>{label}</Text>
        {hint ? <Text style={[s.noteText, { color: colors.text3 }]}>{hint}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

function Done({ text, onChange }: { text: string; onChange: () => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Note tone="good" text={text} />
      <Text style={s.link} onPress={onChange} accessibilityRole="button">
        Change
      </Text>
    </View>
  );
}

// ── Accounting method ──────────────────────────────────────────────────

const METHOD_HINTS: Record<AccountingType, string> = {
  CASH: "You count money when it comes in and goes out.",
  ACCRUAL: "Also known as accruals. You count income and costs when you earn them or are charged, even if the money moves later.",
};

export function AccountingMethodStep({
  taxYear,
  step,
  onDone,
}: {
  taxYear: string;
  step: string;
  /** Called with the confirmed method, or null when the step is reopened. */
  onDone: (method: AccountingType | null) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [held, setHeld] = useState<AccountingType | null>(null);
  const [picked, setPicked] = useState<AccountingType | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState<AccountingType | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadError(null);
    setConfirmed(null);
    onDone(null);
    try {
      const res = await fetchAccountingType(taxYear);
      setHeld(res.data.accountingType);
      setPicked(res.data.accountingType);
    } catch (err) {
      setLoadError(errMsg(err, "Couldn't load your accounting method from HMRC."));
    } finally {
      setLoading(false);
    }
  }, [taxYear, onDone]);

  useEffect(() => {
    load();
  }, [load]);

  const onConfirm = async () => {
    if (!picked) return;
    setError(null);
    setLoadError(null);
    // HMRC: show what it holds; only call Update when the driver changes it.
    if (picked !== held) {
      setSaving(true);
      try {
        await updateAccountingType(taxYear, picked);
        setHeld(picked);
      } catch (err) {
        setError(errMsg(err, "Couldn't update your accounting method. Try again."));
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    setConfirmed(picked);
    onDone(picked);
  };

  return (
    <Section step={step} title="Accounting method">
      {loading ? (
        <ActivityIndicator color={colors.amber} />
      ) : loadError ? (
        <>
          <Note tone="bad" text={loadError} />
          <PrimaryButton label="Try again" icon="refresh" onPress={load} />
        </>
      ) : confirmed ? (
        <Done
          text={`Confirmed for ${taxYear}: ${accountingTypeLabel(confirmed)}.`}
          onChange={() => {
            setConfirmed(null);
            onDone(null);
          }}
        />
      ) : (
        <>
          <Body>
            {held
              ? `HMRC has your business on ${accountingTypeLabel(held).toLowerCase()} for ${taxYear}. Is that right?`
              : `HMRC doesn't have an accounting method for your business for ${taxYear}. Which do you use?`}
          </Body>
          {(["CASH", "ACCRUAL"] as AccountingType[]).map((t) => (
            <Choice
              key={t}
              selected={picked === t}
              label={accountingTypeLabel(t)}
              hint={METHOD_HINTS[t]}
              onPress={() => setPicked(t)}
              disabled={saving}
            />
          ))}
          {picked === "ACCRUAL" && (
            <Note
              tone="warn"
              text="MileClear works out your figures as cash basis. If you use traditional accounting, check your figures with an accountant before you submit your tax return."
            />
          )}
          {error && <Note tone="bad" text={error} />}
          <PrimaryButton
            label={saving ? "Saving..." : picked && picked !== held ? "Tell HMRC" : "Confirm"}
            icon="checkmark"
            onPress={onConfirm}
            disabled={!picked || saving}
          />
        </>
      )}
    </Section>
  );
}

// ── Accounting period ──────────────────────────────────────────────────

export function AccountingPeriodStep({
  taxYear,
  step,
  onDone,
}: {
  taxYear: string;
  step: string;
  onDone: (done: boolean) => void;
}) {
  const y = parseInt(taxYear.slice(0, 4), 10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [held, setHeld] = useState<PeriodsAnswer | null>(null);
  const [choice, setChoice] = useState<PeriodsChoice | null>(null);
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState<PeriodsAnswer | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadError(null);
    setConfirmed(null);
    setWarnings([]);
    onDone(false);
    try {
      const res = await fetchPeriodsOfAccount(taxYear);
      const answer = res.data.answer;
      setHeld(answer);
      setChoice(answer?.choice ?? null);
      setStart(answer?.startDate ? new Date(`${answer.startDate}T12:00:00`) : null);
      setEnd(answer?.endDate ? new Date(`${answer.endDate}T12:00:00`) : null);
    } catch (err) {
      setLoadError(errMsg(err, "Couldn't load your accounting period from HMRC."));
    } finally {
      setLoading(false);
    }
  }, [taxYear, onDone]);

  useEffect(() => {
    load();
  }, [load]);

  const current: PeriodsAnswer | null = choice
    ? choice === "custom"
      ? { choice, startDate: start ? toIsoDay(start) : undefined, endDate: end ? toIsoDay(end) : undefined }
      : { choice }
    : null;

  const sameAsHeld =
    !!held &&
    !!current &&
    held.choice === current.choice &&
    (current.choice !== "custom" || (held.startDate === current.startDate && held.endDate === current.endDate));

  const onSend = async () => {
    if (!current) return;
    setError(null);
    setLoadError(null);
    if (sameAsHeld) {
      setConfirmed(current);
      onDone(true);
      return;
    }
    setSaving(true);
    try {
      const res = await sendPeriodsOfAccount(taxYear, current);
      setHeld(current);
      setWarnings(res.data.warnings ?? []);
      setConfirmed(current);
      onDone(true);
    } catch (err) {
      setError(errMsg(err, "Couldn't send your accounting period. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section step={step} title="Accounting period">
      {loading ? (
        <ActivityIndicator color={colors.amber} />
      ) : loadError ? (
        <>
          <Note tone="bad" text={loadError} />
          <PrimaryButton label="Try again" icon="refresh" onPress={load} />
        </>
      ) : confirmed ? (
        <>
          <Done
            text={`HMRC has your accounting period for ${taxYear}: ${periodAnswerLabel(confirmed, taxYear)}.`}
            onChange={() => {
              setConfirmed(null);
              onDone(false);
            }}
          />
          {warnings.map((w, i) => (
            <Note key={i} tone="warn" text={w} />
          ))}
        </>
      ) : (
        <>
          <Body>
            Your accounting period is the 12 months your business figures cover. HMRC needs to know if one ended
            between 6 April {y} and 5 April {y + 1}. For most drivers it's the tax year itself.
          </Body>
          {held && <Body muted>HMRC currently has: {periodAnswerLabel(held, taxYear)}.</Body>}
          <Choice
            selected={choice === "tax_year"}
            label={`6 April ${y} to 5 April ${y + 1}`}
            hint="The tax year. Pick this if you're not sure."
            onPress={() => setChoice("tax_year")}
            disabled={saving}
          />
          <Choice
            selected={choice === "to_31_march"}
            label={`1 April ${y} to 31 March ${y + 1}`}
            onPress={() => setChoice("to_31_march")}
            disabled={saving}
          />
          <Choice
            selected={choice === "custom"}
            label="Different dates"
            hint={`The period must end between 6 April ${y} and 5 April ${y + 1}.`}
            onPress={() => setChoice("custom")}
            disabled={saving}
          />
          {choice === "custom" && (
            <View style={{ gap: 8 }}>
              <DateTimePickerField label="Start date" value={start} onChange={setStart} mode="date" hideNow />
              <DateTimePickerField label="End date" value={end} onChange={setEnd} mode="date" hideNow />
            </View>
          )}
          {(() => {
            const late = choice ? lateAccountingDateNote(choice, choice === "custom" ? end : null, taxYear) : null;
            return late ? <Note tone="info" text={late} /> : null;
          })()}
          <Choice
            selected={choice === "none"}
            label="No accounting period ended in this tax year"
            hint="For example, your business started late in the year and its first period ends next year."
            onPress={() => setChoice("none")}
            disabled={saving}
          />
          {error && <Note tone="bad" text={error} />}
          <PrimaryButton
            label={saving ? "Sending..." : sameAsHeld ? "Confirm" : "Tell HMRC"}
            icon="checkmark"
            onPress={onSend}
            disabled={!current || saving || (choice === "custom" && (!start || !end))}
          />
        </>
      )}
    </Section>
  );
}
