/**
 * The Open Banking `state` is the only thing the public callback trusts to
 * say which driver a bank belongs to (17 Oct 2026). It must be signed,
 * short-lived and single use.
 */
import { describe, it, expect, beforeEach } from "vitest";
import crypto from "node:crypto";
import {
  issueOpenBankingState,
  readOpenBankingState,
  consumeOpenBankingState,
  STATE_TTL_MS,
  _resetUsedOpenBankingStates,
} from "../../lib/openBankingState.js";

const USER = "00000000-0000-0000-0000-0000000000a1";
const OTHER = "00000000-0000-0000-0000-0000000000b2";

function decodePayload(state: string) {
  return JSON.parse(Buffer.from(state.split(".")[1], "base64url").toString("utf8"));
}

function reencode(state: string, payload: unknown) {
  const [v, , sig] = state.split(".");
  return `${v}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${sig}`;
}

beforeEach(() => _resetUsedOpenBankingStates());

describe("Open Banking state", () => {
  it("a fresh state is accepted once and names the driver and return target", () => {
    const state = issueOpenBankingState(USER, "web");
    const check = consumeOpenBankingState(state);
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.payload.userId).toBe(USER);
      expect(check.payload.returnTo).toBe("web");
    }
  });

  it("two states for the same driver carry different nonces", () => {
    const a = decodePayload(issueOpenBankingState(USER, "app"));
    const b = decodePayload(issueOpenBankingState(USER, "app"));
    expect(a.n).not.toBe(b.n);
  });

  it("is refused the second time (replayed), still attributed", () => {
    const state = issueOpenBankingState(USER, "app");
    expect(consumeOpenBankingState(state).ok).toBe(true);
    const again = consumeOpenBankingState(state);
    expect(again).toMatchObject({ ok: false, reason: "replayed", payload: { userId: USER } });
  });

  it("is refused after 15 minutes (expired)", () => {
    const issued = Date.now();
    const state = issueOpenBankingState(USER, "app", issued);
    expect(consumeOpenBankingState(state, issued + STATE_TTL_MS + 1)).toMatchObject({
      ok: false,
      reason: "expired",
    });
  });

  it("is accepted just inside 15 minutes", () => {
    const issued = Date.now();
    const state = issueOpenBankingState(USER, "app", issued);
    expect(consumeOpenBankingState(state, issued + STATE_TTL_MS - 1000).ok).toBe(true);
  });

  it("is refused when issued in the future beyond clock skew", () => {
    const now = Date.now();
    const state = issueOpenBankingState(USER, "app", now + 5 * 60 * 1000);
    expect(consumeOpenBankingState(state, now)).toMatchObject({ ok: false, reason: "expired" });
  });

  it("an edited payload naming another driver fails its signature", () => {
    const state = issueOpenBankingState(USER, "app");
    const forged = reencode(state, { ...decodePayload(state), u: OTHER });
    const check = consumeOpenBankingState(forged);
    expect(check).toEqual({ ok: false, reason: "bad_signature" });
    expect(readOpenBankingState(forged)).toBeNull();
  });

  it("a fresh issued time on an old state fails its signature", () => {
    const state = issueOpenBankingState(USER, "app", Date.now() - STATE_TTL_MS * 4);
    const forged = reencode(state, { ...decodePayload(state), iat: Date.now() });
    expect(consumeOpenBankingState(forged)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("a state signed with another key is refused", () => {
    const payload = Buffer.from(
      JSON.stringify({ u: USER, iat: Date.now(), n: "x".repeat(22), r: "app" })
    ).toString("base64url");
    const sig = crypto.createHmac("sha256", "not-our-key").update(`v1.${payload}`).digest("base64url");
    expect(consumeOpenBankingState(`v1.${payload}.${sig}`)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("is not signed with the raw JWT secret", () => {
    const state = issueOpenBankingState(USER, "app");
    const [v, p, sig] = state.split(".");
    const raw = crypto.createHmac("sha256", process.env.JWT_SECRET!).update(`${v}.${p}`).digest("base64url");
    expect(sig).not.toBe(raw);
  });

  it("the old unsigned base64 state is refused", () => {
    const old = Buffer.from(JSON.stringify({ userId: USER, ts: Date.now() })).toString("base64url");
    expect(consumeOpenBankingState(old)).toEqual({ ok: false, reason: "bad_signature" });
    expect(readOpenBankingState(old)).toBeNull();
  });

  it("only the canonical spelling of the signature is accepted", () => {
    const state = issueOpenBankingState(USER, "app");
    const [v, p, sig] = state.split(".");
    // Characters base64url decoding skips, and a changed spare low bit on
    // the last character, both decode to the same bytes.
    const last = sig[sig.length - 1];
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const sibling = alphabet[alphabet.indexOf(last) ^ 1];
    for (const variant of [`${sig}=`, `${sig.slice(0, 4)}!${sig.slice(4)}`, sig.slice(0, -1) + sibling]) {
      expect(consumeOpenBankingState(`${v}.${p}.${variant}`)).toEqual({ ok: false, reason: "bad_signature" });
    }
    expect(consumeOpenBankingState(state).ok).toBe(true);
  });

  it("a missing state is reported as missing", () => {
    expect(consumeOpenBankingState(undefined)).toEqual({ ok: false, reason: "missing" });
    expect(consumeOpenBankingState("")).toEqual({ ok: false, reason: "missing" });
    expect(consumeOpenBankingState(["a", "b"])).toEqual({ ok: false, reason: "missing" });
  });

  it("junk and over-long states are refused without throwing", () => {
    for (const junk of ["v1", "v1..", "v1.a.b", "v2.a.b", "x".repeat(600), "a.b.c.d"]) {
      expect(consumeOpenBankingState(junk)).toEqual({ ok: false, reason: "bad_signature" });
    }
  });

  it("reading a state does not use it up", () => {
    const state = issueOpenBankingState(USER, "app");
    expect(readOpenBankingState(state)?.userId).toBe(USER);
    expect(consumeOpenBankingState(state).ok).toBe(true);
  });
});
