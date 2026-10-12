"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PROFESSIONAL_BODIES } from "@mileclear/shared";
import { Button, Card, SelectField, TextField } from "../../../components/dashboard/kit";
import { useAuth } from "../../../lib/auth-context";
import { errorText, papi, PracticeError } from "../../../lib/practice";

const KEY = "pc_signup";

interface Firm {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  professionalBody: string;
  arn: string;
}

const EMPTY: Firm = { name: "", contactName: "", email: "", phone: "", professionalBody: "", arn: "" };

function loadStored(): Firm | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Firm>) } : null;
  } catch {
    return null;
  }
}

export default function PracticeSignupPage() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [firm, setFirm] = useState<Firm>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Firm, string>>>({});
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyMember, setAlreadyMember] = useState(false);

  useEffect(() => {
    document.title = "Create a free practice account · MileClear";
    const stored = loadStored();
    if (stored) {
      setFirm(stored);
      if (stored.name && stored.contactName && stored.email) setStep(2);
    }
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    papi
      .get("/practice/me")
      .then(() => setAlreadyMember(true))
      .catch(() => setAlreadyMember(false));
  }, [loading, user]);

  const set = (k: keyof Firm) => (v: string) => setFirm((f) => ({ ...f, [k]: v }));

  function next(e: React.FormEvent) {
    e.preventDefault();
    const errs: Partial<Record<keyof Firm, string>> = {};
    if (firm.name.trim().length < 2) errs.name = "Enter the firm's name";
    if (firm.contactName.trim().length < 2) errs.contactName = "Enter your name";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(firm.email.trim())) errs.email = "Enter a work email";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      sessionStorage.setItem(KEY, JSON.stringify(firm));
    } catch {
      /* private mode: carry on, they finish in this tab */
    }
    setStep(2);
  }

  async function create() {
    setCreating(true);
    setError(null);
    try {
      await papi.post("/practice/signup", {
        name: firm.name.trim(),
        contactName: firm.contactName.trim(),
        email: firm.email.trim(),
        phone: firm.phone.trim() || null,
        professionalBody: firm.professionalBody || null,
        arn: firm.arn.trim() || null,
      });
      try {
        sessionStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
      router.push("/practice");
    } catch (e) {
      if (e instanceof PracticeError && e.code === "already_member") {
        router.push("/practice");
        return;
      }
      setError(errorText(e, "Couldn't create the practice. Try again."));
    } finally {
      setCreating(false);
    }
  }

  const back = encodeURIComponent("/practice/signup");

  return (
    <div className="pc-auth">
      <div className="pc-auth__brand">
        <Link href="/accountants" className="mc-wordmark">
          <img src="/branding/logo-120x120.png" alt="" width={28} height={28} className="mc-wordmark__logo" />
          <span className="mc-wordmark__text">
            Mile<span>Clear</span>
          </span>
        </Link>
      </div>

      {alreadyMember ? (
        <Card>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>You already have a practice</h1>
          <p className="pc-muted" style={{ marginBottom: 16 }}>
            One practice per account for now.
          </p>
          <Button variant="primary" href="/practice">
            Open your client list
          </Button>
        </Card>
      ) : step === 1 ? (
        <Card>
          <p className="pc-step">Step 1 of 2</p>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "4px 0 16px" }}>Your firm</h1>
          <form className="pc-form" onSubmit={next} noValidate>
            <TextField label="Firm name" value={firm.name} onChange={set("name")} error={errors.name} maxLength={160} autoComplete="organization" />
            <TextField label="Your name" value={firm.contactName} onChange={set("contactName")} error={errors.contactName} maxLength={120} autoComplete="name" />
            <TextField label="Work email" type="email" value={firm.email} onChange={set("email")} error={errors.email} maxLength={255} autoComplete="email" />
            <TextField label="Phone" type="tel" required={false} value={firm.phone} onChange={set("phone")} maxLength={40} autoComplete="tel" />
            <SelectField
              label="Professional body"
              required={false}
              value={firm.professionalBody}
              onChange={set("professionalBody")}
              options={[{ value: "", label: "Choose one" }, ...PROFESSIONAL_BODIES.map((b) => ({ value: b.value, label: b.label }))]}
            />
            <TextField
              label="Agent Reference Number"
              required={false}
              value={firm.arn}
              onChange={set("arn")}
              maxLength={20}
              hint="Only needed later, for quarterly updates as an agent."
            />
            <Button type="submit" variant="primary" fullWidth>
              Continue
            </Button>
          </form>
          <p className="pc-muted" style={{ fontSize: 13, marginTop: 16 }}>
            Free for accountants and bookkeepers. New practices show to drivers as &ldquo;Not checked yet&rdquo; until we check them, usually within one working day.
          </p>
        </Card>
      ) : (
        <Card>
          <p className="pc-step">Step 2 of 2</p>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "4px 0 16px" }}>Your sign-in</h1>
          {loading ? null : user ? (
            <div className="pc-form">
              <p className="pc-muted">
                You&apos;re signed in as <strong style={{ color: "var(--mc-text-1)" }}>{user.email}</strong>. We&apos;ll add {firm.name || "the practice"} to this account.
              </p>
              {error && <p className="pc-error" role="alert">{error}</p>}
              <Button variant="primary" fullWidth loading={creating} onClick={() => void create()}>
                Create the practice
              </Button>
              <button
                type="button"
                className="mc-textlink"
                onClick={() => {
                  void logout();
                }}
              >
                Use a different account
              </button>
            </div>
          ) : (
            <div className="pc-form">
              <p className="pc-muted">
                Already use MileClear with {firm.email || "this email"}? Sign in to add the practice to your account. Otherwise, create a sign-in with a password and the usual 6-digit email code.
              </p>
              <Button variant="primary" fullWidth href={`/register?next=${back}`}>
                Create my sign-in
              </Button>
              <Button variant="secondary" fullWidth href={`/login?next=${back}`}>
                I already use MileClear, sign in
              </Button>
            </div>
          )}
          <button type="button" className="mc-textlink" style={{ marginTop: 16 }} onClick={() => setStep(1)}>
            Back to your firm
          </button>
        </Card>
      )}
    </div>
  );
}
