/**
 * Feedback route tests.
 *
 * Tests the public submission endpoint, the paginated list endpoint (with
 * category/status filtering), and the authenticated vote-toggle endpoint.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------
vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    feedback: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      groupBy: vi.fn(),
    },
    feedbackVote: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      groupBy: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { feedbackRoutes } from "../../routes/feedback/index.js";
import { prisma } from "../../lib/prisma.js";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------
const USER_ID = "00000000-0000-0000-0000-000000000002";
const FEEDBACK_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const FEEDBACK_ITEM = {
  id: FEEDBACK_ID,
  userId: USER_ID,
  displayName: "A User",
  title: "Make the app faster",
  body: "The dashboard loads slowly on older phones.",
  category: "improvement",
  status: "new",
  upvoteCount: 5,
  createdAt: new Date("2025-01-15T10:00:00Z"),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTestApp() {
  const app = await buildApp();
  await app.register(feedbackRoutes, { prefix: "/feedback" });
  return app;
}

function resetMocks() {
  vi.clearAllMocks();

  vi.mocked(prisma.feedback.findMany).mockResolvedValue([]);
  vi.mocked(prisma.feedback.count).mockResolvedValue(0);
  vi.mocked(prisma.feedbackVote.findMany).mockResolvedValue([]);
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
    if (typeof fn === "function") {
      return fn({ ...prisma });
    }
    return Promise.all(fn);
  });
}

// ---------------------------------------------------------------------------
// POST /feedback — submit feedback
// ---------------------------------------------------------------------------

describe("POST /feedback", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    resetMocks();
    app = await createTestApp();
  });

  it("201 — submits valid feedback anonymously", async () => {
    vi.mocked(prisma.feedback.create).mockResolvedValue({
      ...FEEDBACK_ITEM,
      userId: null,
      displayName: null,
    } as any);

    const res = await app.inject({
      method: "POST",
      url: "/feedback",
      payload: {
        title: "Add dark mode",
        body: "Dark mode would be really helpful for night driving.",
        category: "feature_request",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.data.title).toBe("Make the app faster"); // from mock return
    expect(body.data.hasVoted).toBe(false);
    expect(body.message).toMatch(/submitted/i);
  });

  it("201 — submits feedback with optional displayName", async () => {
    vi.mocked(prisma.feedback.create).mockResolvedValue(FEEDBACK_ITEM as any);

    const res = await app.inject({
      method: "POST",
      url: "/feedback",
      payload: {
        displayName: "GigWorker99",
        title: "Better mileage graphs",
        body: "Weekly graphs would be great to visualise progress.",
        category: "feature_request",
      },
    });

    expect(res.statusCode).toBe(201);
    expect(vi.mocked(prisma.feedback.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ displayName: "GigWorker99" }),
      })
    );
  });

  it("400 — rejects title shorter than 3 characters", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/feedback",
      payload: {
        title: "Hi",
        body: "This body is long enough to pass validation rules here.",
        category: "other",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBeDefined();
  });

  it("400 — rejects body shorter than 10 characters", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/feedback",
      payload: {
        title: "A valid title",
        body: "Too short",
        category: "other",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("400 — rejects invalid category value", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/feedback",
      payload: {
        title: "A valid title here",
        body: "A body that is definitely long enough to pass.",
        category: "invalid_category",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("defaults category to 'feature_request' when omitted", async () => {
    vi.mocked(prisma.feedback.create).mockResolvedValue({
      ...FEEDBACK_ITEM,
      category: "feature_request",
    } as any);

    const res = await app.inject({
      method: "POST",
      url: "/feedback",
      payload: {
        title: "Some good idea",
        body: "A detailed description of the idea that meets min length.",
      },
    });

    expect(res.statusCode).toBe(201);
    expect(vi.mocked(prisma.feedback.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ category: "feature_request" }),
      })
    );
  });

  it("strips HTML tags from title and body (XSS prevention)", async () => {
    vi.mocked(prisma.feedback.create).mockResolvedValue(FEEDBACK_ITEM as any);

    await app.inject({
      method: "POST",
      url: "/feedback",
      payload: {
        title: "<script>alert(1)</script>Real title",
        body: "Real body content that is long enough to be valid here.",
        category: "bug_report",
      },
    });

    const createCall = vi.mocked(prisma.feedback.create).mock.calls[0];
    const data = (createCall[0] as any).data;
    expect(data.title).not.toContain("<script>");
    expect(data.title).toContain("Real title");
  });
});

// ---------------------------------------------------------------------------
// GET /feedback — list
// ---------------------------------------------------------------------------

describe("GET /feedback", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    resetMocks();
    app = await createTestApp();
  });

  it("200 — returns paginated list of feedback", async () => {
    vi.mocked(prisma.feedback.findMany).mockResolvedValue([
      FEEDBACK_ITEM,
    ] as any);
    vi.mocked(prisma.feedback.count).mockResolvedValue(1);

    const res = await app.inject({
      method: "GET",
      url: "/feedback",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.totalPages).toBe(1);
  });

  it("200 — returns empty list when no feedback exists", async () => {
    vi.mocked(prisma.feedback.findMany).mockResolvedValue([]);
    vi.mocked(prisma.feedback.count).mockResolvedValue(0);

    const res = await app.inject({ method: "GET", url: "/feedback" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(0);
    expect(body.total).toBe(0);
    expect(body.totalPages).toBe(0);
  });

  it("paginates — page=2&pageSize=1 queries correct skip/take", async () => {
    vi.mocked(prisma.feedback.findMany).mockResolvedValue([]);
    vi.mocked(prisma.feedback.count).mockResolvedValue(5);

    await app.inject({
      method: "GET",
      url: "/feedback?page=2&pageSize=1",
    });

    expect(vi.mocked(prisma.feedback.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 1, take: 1 })
    );
  });

  it("filters by category when provided", async () => {
    vi.mocked(prisma.feedback.findMany).mockResolvedValue([]);
    vi.mocked(prisma.feedback.count).mockResolvedValue(0);

    await app.inject({
      method: "GET",
      url: "/feedback?category=bug_report",
    });

    expect(vi.mocked(prisma.feedback.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ category: "bug_report" }),
      })
    );
  });

  it("filters by status when provided", async () => {
    vi.mocked(prisma.feedback.findMany).mockResolvedValue([]);
    vi.mocked(prisma.feedback.count).mockResolvedValue(0);

    await app.inject({
      method: "GET",
      url: "/feedback?status=planned",
    });

    expect(vi.mocked(prisma.feedback.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "planned" }),
      })
    );
  });

  it("sorts by newest when sort=newest", async () => {
    vi.mocked(prisma.feedback.findMany).mockResolvedValue([]);
    vi.mocked(prisma.feedback.count).mockResolvedValue(0);

    await app.inject({ method: "GET", url: "/feedback?sort=newest" });

    expect(vi.mocked(prisma.feedback.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
      })
    );
  });

  it("marks hasVoted=true for authenticated user who has voted", async () => {
    vi.mocked(prisma.feedback.findMany).mockResolvedValue([FEEDBACK_ITEM] as any);
    vi.mocked(prisma.feedback.count).mockResolvedValue(1);
    vi.mocked(prisma.feedbackVote.findMany).mockResolvedValue([
      { feedbackId: FEEDBACK_ID },
    ] as any);

    const token = makeAccessToken(USER_ID);
    const res = await app.inject({
      method: "GET",
      url: "/feedback",
      headers: { authorization: `Bearer ${token}` },
    });

    const body = res.json();
    expect(body.data[0].hasVoted).toBe(true);
  });

  it("marks hasVoted=false for authenticated user who has not voted", async () => {
    vi.mocked(prisma.feedback.findMany).mockResolvedValue([FEEDBACK_ITEM] as any);
    vi.mocked(prisma.feedback.count).mockResolvedValue(1);
    vi.mocked(prisma.feedbackVote.findMany).mockResolvedValue([]);

    const token = makeAccessToken(USER_ID);
    const res = await app.inject({
      method: "GET",
      url: "/feedback",
      headers: { authorization: `Bearer ${token}` },
    });

    const body = res.json();
    expect(body.data[0].hasVoted).toBe(false);
  });

  it("marks isOwner=true for feedback submitted by the authenticated user", async () => {
    vi.mocked(prisma.feedback.findMany).mockResolvedValue([FEEDBACK_ITEM] as any);
    vi.mocked(prisma.feedback.count).mockResolvedValue(1);
    vi.mocked(prisma.feedbackVote.findMany).mockResolvedValue([]);

    const token = makeAccessToken(USER_ID);
    const res = await app.inject({
      method: "GET",
      url: "/feedback",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.json().data[0].isOwner).toBe(true);
  });

  it("400 — rejects invalid pageSize value", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/feedback?pageSize=999",
    });

    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /feedback/:id/vote — toggle vote
// ---------------------------------------------------------------------------

describe("POST /feedback/:id/vote", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    resetMocks();
    app = await createTestApp();
  });

  it("401 — rejects unauthenticated vote attempt", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/feedback/${FEEDBACK_ID}/vote`,
    });

    expect(res.statusCode).toBe(401);
  });

  it("200 — adds a vote when user has not voted yet", async () => {
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue(FEEDBACK_ITEM as any);

    // Transaction: no existing vote → create vote
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      const mockTx = {
        feedbackVote: {
          findUnique: vi.fn().mockResolvedValue(null), // No existing vote
          create: vi.fn().mockResolvedValue({ id: "vote-1", feedbackId: FEEDBACK_ID, userId: USER_ID }),
          delete: vi.fn(),
        },
        feedback: {
          update: vi.fn().mockResolvedValue(FEEDBACK_ITEM),
        },
      };
      return fn(mockTx);
    });

    const token = makeAccessToken(USER_ID);
    const res = await app.inject({
      method: "POST",
      url: `/feedback/${FEEDBACK_ID}/vote`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.voted).toBe(true);
    expect(body.message).toMatch(/voted/i);
  });

  it("200 — removes a vote when user has already voted (toggle off)", async () => {
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue(FEEDBACK_ITEM as any);

    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      const mockTx = {
        feedbackVote: {
          findUnique: vi.fn().mockResolvedValue({
            id: "vote-1",
            feedbackId: FEEDBACK_ID,
            userId: USER_ID,
          }),
          delete: vi.fn().mockResolvedValue({}),
          create: vi.fn(),
        },
        feedback: {
          update: vi.fn().mockResolvedValue(FEEDBACK_ITEM),
        },
      };
      return fn(mockTx);
    });

    const token = makeAccessToken(USER_ID);
    const res = await app.inject({
      method: "POST",
      url: `/feedback/${FEEDBACK_ID}/vote`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.voted).toBe(false);
  });

  it("404 — returns 404 for a non-existent feedback ID", async () => {
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue(null);

    const token = makeAccessToken(USER_ID);
    const res = await app.inject({
      method: "POST",
      url: `/feedback/${FEEDBACK_ID}/vote`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatch(/not found/i);
  });

  it("400 — rejects a non-UUID feedback ID", async () => {
    const token = makeAccessToken(USER_ID);
    const res = await app.inject({
      method: "POST",
      url: "/feedback/not-a-uuid/vote",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/invalid feedback id/i);
  });
});
