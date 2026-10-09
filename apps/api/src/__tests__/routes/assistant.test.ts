/**
 * Ask MileClear: dormant without a key, daily and monthly limits, the tool
 * loop against a mocked Anthropic, and that the driver id always comes from
 * the signed-in request.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    appEvent: { count: vi.fn() },
    earning: { findMany: vi.fn() },
    trip: { findMany: vi.fn() },
    vehicle: { findMany: vi.fn() },
  },
}));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));
// Pro gate: free unless the test says otherwise.
const pro = { on: true };
vi.mock("../../middleware/premium.js", () => ({
  premiumMiddleware: vi.fn(async (_req: unknown, reply: { status: (n: number) => { send: (b: unknown) => unknown } }) => {
    if (!pro.on) return reply.status(403).send({ error: { code: "PREMIUM_REQUIRED", message: "Pro", retryable: false } });
  }),
}));

import { assistantRoutes } from "../../routes/assistant/index.js";
import { prisma } from "../../lib/prisma.js";
import { logEvent } from "../../services/appEvents.js";
import { runAssistant, MAX_ITERATIONS, AssistantUpstreamError } from "../../services/assistant.js";

const ME = "22222222-2222-2222-2222-222222222222";
const auth = { authorization: `Bearer ${makeAccessToken(ME)}` };
const QUESTION = "How much did I make on Uber in September?";

function anthropicResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const toolTurn = (input: object, name = "earnings_summary") => ({
  content: [
    { type: "text", text: "Let me check." },
    { type: "tool_use", id: "toolu_1", name, input },
  ],
  stop_reason: "tool_use",
  usage: { input_tokens: 1200, output_tokens: 60 },
});
const finalTurn = (text: string) => ({
  content: [{ type: "text", text }],
  stop_reason: "end_turn",
  usage: { input_tokens: 1500, output_tokens: 40 },
});

async function createApp() {
  const app = await buildApp();
  await app.register(assistantRoutes, { prefix: "/assistant" });
  return app;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  pro.on = true;
  process.env.ANTHROPIC_API_KEY = "test-key-not-real";
  vi.mocked(prisma.appEvent.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.earning.findMany).mockResolvedValue([
    { platform: "uber", amountPence: 45678, periodStart: new Date("2026-09-12T00:00:00Z") },
  ] as never);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  vi.unstubAllGlobals();
});

describe("dormant mode (no ANTHROPIC_API_KEY)", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("status says unavailable", async () => {
    const app = await createApp();
    const res = await app.inject({ method: "GET", url: "/assistant/status", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ available: false });
  });

  it("ask returns 503 for everyone, before the Pro check, and never calls Anthropic", async () => {
    pro.on = false;
    const app = await createApp();
    const res = await app.inject({ method: "POST", url: "/assistant/ask", headers: auth, payload: { question: QUESTION } });
    expect(res.statusCode).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a blank key as absent", async () => {
    process.env.ANTHROPIC_API_KEY = "   ";
    const app = await createApp();
    const res = await app.inject({ method: "GET", url: "/assistant/status", headers: auth });
    expect(res.json().available).toBe(false);
  });
});

describe("POST /assistant/ask", () => {
  it("requires sign-in and Pro", async () => {
    const app = await createApp();
    expect((await app.inject({ method: "POST", url: "/assistant/ask", payload: { question: QUESTION } })).statusCode).toBe(401);
    pro.on = false;
    const res = await app.inject({ method: "POST", url: "/assistant/ask", headers: auth, payload: { question: QUESTION } });
    expect(res.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates the question and history", async () => {
    const app = await createApp();
    const long = await app.inject({ method: "POST", url: "/assistant/ask", headers: auth, payload: { question: "x".repeat(501) } });
    expect(long.statusCode).toBe(400);
    const tooMuchHistory = await app.inject({
      method: "POST",
      url: "/assistant/ask",
      headers: auth,
      payload: { question: QUESTION, history: Array.from({ length: 7 }, () => ({ role: "user", text: "hi" })) },
    });
    expect(tooMuchHistory.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("runs the tool loop and answers, logging tokens but not the question", async () => {
    fetchMock
      .mockResolvedValueOnce(anthropicResponse(toolTurn({ from: "2026-09-01", to: "2026-09-30", platform: "uber" })))
      .mockResolvedValueOnce(anthropicResponse(finalTurn("From 1 Sep 2026 to 30 Sep 2026 you recorded £456.78 from Uber.")));
    const app = await createApp();
    const res = await app.inject({ method: "POST", url: "/assistant/ask", headers: auth, payload: { question: QUESTION } });

    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.answer).toContain("£456.78");
    expect(data.periods).toEqual(["1 Sep 2026 to 30 Sep 2026"]);
    expect(data.remainingToday).toBe(19);
    expect(data.remainingThisMonth).toBe(199);

    // Request shape sent to Anthropic.
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("test-key-not-real");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.output_config).toEqual({ effort: "low" });
    expect(body.max_tokens).toBeLessThanOrEqual(2000);
    expect(body.tools.map((t: { name: string }) => t.name)).toContain("earnings_summary");

    // Second call carries the tool_result for the tool_use, in one user turn.
    const second = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    const last = second.messages[second.messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1" });
    expect(last.content[0].content).toContain("45678");

    // Scoped to the signed-in driver.
    expect(vi.mocked(prisma.earning.findMany).mock.calls[0][0]!.where).toMatchObject({ userId: ME, platform: "uber" });

    // Logged without the question text.
    expect(logEvent).toHaveBeenCalledWith(
      "assistant.asked",
      ME,
      expect.objectContaining({ inputTokens: 2700, outputTokens: 100, toolCalls: ["earnings_summary"], outcome: "answered" })
    );
    const meta = vi.mocked(logEvent).mock.calls[0][2]!;
    expect(JSON.stringify(meta)).not.toContain("Uber in September");
  });

  it("ignores a user id the model tries to pass and queries nobody else", async () => {
    fetchMock
      .mockResolvedValueOnce(
        anthropicResponse(toolTurn({ from: "2026-09-01", to: "2026-09-30", userId: "33333333-3333-3333-3333-333333333333" }))
      )
      .mockResolvedValueOnce(anthropicResponse(finalTurn("Sorry, I couldn't get that.")));
    const app = await createApp();
    const res = await app.inject({ method: "POST", url: "/assistant/ask", headers: auth, payload: { question: QUESTION } });
    expect(res.statusCode).toBe(200);
    expect(prisma.earning.findMany).not.toHaveBeenCalled();
    const second = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    const result = second.messages[second.messages.length - 1].content[0];
    expect(result.is_error).toBe(true);
  });

  it("stops at the daily limit with a friendly 429", async () => {
    vi.mocked(prisma.appEvent.count).mockResolvedValueOnce(20 as never).mockResolvedValueOnce(20 as never);
    const app = await createApp();
    const res = await app.inject({ method: "POST", url: "/assistant/ask", headers: auth, payload: { question: QUESTION } });
    expect(res.statusCode).toBe(429);
    expect(res.json().error.message).toMatch(/20 questions today/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops at the monthly limit", async () => {
    vi.mocked(prisma.appEvent.count).mockResolvedValueOnce(3 as never).mockResolvedValueOnce(400 as never);
    const app = await createApp();
    const res = await app.inject({ method: "POST", url: "/assistant/ask", headers: auth, payload: { question: QUESTION } });
    expect(res.statusCode).toBe(429);
    expect(res.json().error.message).toMatch(/this month/);
  });

  it("counts only this driver's asked events since UK midnight and the 1st", async () => {
    fetchMock.mockResolvedValueOnce(anthropicResponse(finalTurn("Hello.")));
    const app = await createApp();
    await app.inject({ method: "POST", url: "/assistant/ask", headers: auth, payload: { question: QUESTION } });
    const wheres = vi.mocked(prisma.appEvent.count).mock.calls.map((c) => c[0]!.where);
    for (const w of wheres) expect(w).toMatchObject({ userId: ME, type: "assistant.asked" });
  });

  it("turns an Anthropic failure into a 503 that does not use up the allowance", async () => {
    fetchMock.mockResolvedValueOnce(anthropicResponse({ type: "error" }, 529));
    const app = await createApp();
    const res = await app.inject({ method: "POST", url: "/assistant/ask", headers: auth, payload: { question: QUESTION } });
    expect(res.statusCode).toBe(503);
    expect(logEvent).toHaveBeenCalledWith("assistant.failed", ME, expect.objectContaining({ status: 529 }));
    expect(logEvent).not.toHaveBeenCalledWith("assistant.asked", expect.anything(), expect.anything());
  });
});

describe("runAssistant loop", () => {
  it(`gives up after ${MAX_ITERATIONS} rounds of tool calls`, async () => {
    const fetchImpl = vi.fn(async () =>
      anthropicResponse(toolTurn({ from: "2026-09-01", to: "2026-09-30" }))
    ) as unknown as typeof fetch;
    const r = await runAssistant({ userId: ME, question: QUESTION, fetchImpl });
    expect(r.outcome).toBe("loop_limit");
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_ITERATIONS);
    expect(r.answer).toMatch(/couldn't work that out/);
  });

  it("handles a refusal without showing model text", async () => {
    const fetchImpl = vi.fn(async () =>
      anthropicResponse({ content: [], stop_reason: "refusal", usage: { input_tokens: 10, output_tokens: 0 } })
    ) as unknown as typeof fetch;
    const r = await runAssistant({ userId: ME, question: "something unrelated", fetchImpl });
    expect(r.outcome).toBe("refusal");
    expect(r.answer).toMatch(/MileClear records/);
  });

  it("sends history as alternating turns starting with the driver", async () => {
    const fetchImpl = vi.fn(async () => anthropicResponse(finalTurn("ok"))) as unknown as typeof fetch;
    await runAssistant({
      userId: ME,
      question: "And August?",
      history: [
        { role: "assistant", text: "Hi, ask me anything about your records." },
        { role: "user", text: QUESTION },
        { role: "assistant", text: "£456.78 in September." },
      ],
      fetchImpl,
    });
    const body = JSON.parse(((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit).body as string);
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(body.messages[2].content).toBe("And August?");
    expect(body.system[1].text).toMatch(/Today is/);
  });

  it("raises a network failure as an upstream error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await expect(runAssistant({ userId: ME, question: QUESTION, fetchImpl })).rejects.toBeInstanceOf(AssistantUpstreamError);
  });
});
