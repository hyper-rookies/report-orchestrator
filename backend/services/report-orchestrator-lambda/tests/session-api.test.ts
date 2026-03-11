jest.mock("../src/session-storage", () => ({
  createDashboardShareCode: jest.fn(),
  createSessionShareCode: jest.fn(),
  deleteBookmark: jest.fn(),
  deleteSession: jest.fn(),
  getBookmark: jest.fn(),
  getSession: jest.fn(),
  hasSessionBucket: jest.fn(),
  listBookmarks: jest.fn(),
  listSessions: jest.fn(),
  renameSession: jest.fn(),
  resolveDashboardShareCode: jest.fn(),
  resolveSessionShareCode: jest.fn(),
  saveBookmark: jest.fn(),
  saveSession: jest.fn(),
}));

import { signShareToken } from "../src/share-token";
import {
  handleSessionRoute,
  resolveRoute,
  type AuthenticatedCaller,
} from "../src/session-api";
import {
  createDashboardShareCode,
  createSessionShareCode,
  deleteBookmark,
  getBookmark,
  getSession,
  hasSessionBucket,
  listBookmarks,
  listSessions,
  resolveSessionShareCode,
  resolveDashboardShareCode,
  saveBookmark,
  saveSession,
} from "../src/session-storage";

const caller: AuthenticatedCaller = { sub: "user-sub-1", email: "user@example.com" };

beforeEach(() => {
  jest.resetAllMocks();
  process.env.SHARE_TOKEN_SECRET = "12345678901234567890123456789012";
  (hasSessionBucket as jest.Mock).mockReturnValue(true);
});

test("resolveRoute parses session collection, item, share, and public share paths", () => {
  expect(resolveRoute("/bookmarks")).toEqual({ type: "bookmarks" });
  expect(resolveRoute("/bookmarks/bk-123")).toEqual({ type: "bookmark", id: "bk-123" });
  expect(resolveRoute("/share")).toEqual({ type: "shares" });
  expect(resolveRoute("/sessions")).toEqual({ type: "sessions" });
  expect(resolveRoute("/sessions/abc")).toEqual({ type: "session", id: "abc" });
  expect(resolveRoute("/sessions/abc/share")).toEqual({ type: "sessionShare", id: "abc" });
  expect(resolveRoute("/share/session/code1234")).toEqual({
    type: "sharedSession",
    code: "code1234",
  });
  expect(resolveRoute("/share/code1234")).toEqual({
    type: "dashboardShare",
    code: "code1234",
  });
});

test("GET /sessions returns the caller's sorted list from storage", async () => {
  (listSessions as jest.Mock).mockResolvedValue([
    { sessionId: "s1", title: "Title", createdAt: "2026-01-01", updatedAt: "2026-01-02" },
  ]);

  const result = await handleSessionRoute({ type: "sessions" }, "GET", {}, caller);

  expect(result).toEqual({
    statusCode: 200,
    body: [{ sessionId: "s1", title: "Title", createdAt: "2026-01-01", updatedAt: "2026-01-02" }],
  });
  expect(listSessions).toHaveBeenCalledWith("user-sub-1");
});

test("GET /bookmarks returns the caller's bookmark list from storage", async () => {
  (listBookmarks as jest.Mock).mockResolvedValue([
    {
      bookmarkId: "bk-1",
      title: "Bookmark Title",
      prompt: "Show me sessions by channel",
      previewType: "chart",
      chartType: "bar",
      createdAt: "2026-03-11T00:00:00.000Z",
    },
  ]);

  const result = await handleSessionRoute({ type: "bookmarks" }, "GET", {}, caller);

  expect(result).toEqual({
    statusCode: 200,
    body: [
      {
        bookmarkId: "bk-1",
        title: "Bookmark Title",
        prompt: "Show me sessions by channel",
        previewType: "chart",
        chartType: "bar",
        createdAt: "2026-03-11T00:00:00.000Z",
      },
    ],
  });
  expect(listBookmarks).toHaveBeenCalledWith("user-sub-1");
});

test("POST /bookmarks validates required fields", async () => {
  const result = await handleSessionRoute(
    { type: "bookmarks" },
    "POST",
    { body: JSON.stringify({ prompt: "Hello" }) },
    caller
  );

  expect(result).toEqual({
    statusCode: 400,
    body: { error: "prompt and frames are required" },
  });
});

test("POST /bookmarks persists bookmark data through storage", async () => {
  (saveBookmark as jest.Mock).mockResolvedValue({
    bookmarkId: "bk-1",
    title: "Show me sessions by channel",
    prompt: "Show me sessions by channel",
    previewType: "chart",
    chartType: "bar",
    createdAt: "2026-03-11T00:00:00.000Z",
    frames: [
      {
        type: "chart",
        data: { spec: { type: "bar" } },
      },
    ],
  });

  const result = await handleSessionRoute(
    { type: "bookmarks" },
    "POST",
    {
      body: JSON.stringify({
        prompt: "Show me sessions by channel",
        frames: [
          {
            type: "chart",
            data: { spec: { type: "bar" } },
          },
        ],
      }),
    },
    caller
  );

  expect(result).toEqual({
    statusCode: 201,
    body: { bookmarkId: "bk-1" },
  });
  expect(saveBookmark).toHaveBeenCalledWith("user-sub-1", {
    prompt: "Show me sessions by channel",
    frames: [
      {
        type: "chart",
        data: { spec: { type: "bar" } },
      },
    ],
  });
});

test("GET /bookmarks/{id} returns the stored bookmark", async () => {
  (getBookmark as jest.Mock).mockResolvedValue({
    bookmarkId: "bk-1",
    title: "Bookmark Title",
    prompt: "Show me sessions by channel",
    previewType: "chart",
    chartType: "bar",
    createdAt: "2026-03-11T00:00:00.000Z",
    frames: [],
  });

  const result = await handleSessionRoute({ type: "bookmark", id: "bk-1" }, "GET", {}, caller);

  expect(result.statusCode).toBe(200);
  expect(getBookmark).toHaveBeenCalledWith("user-sub-1", "bk-1");
});

test("DELETE /bookmarks/{id} deletes the bookmark", async () => {
  const result = await handleSessionRoute(
    { type: "bookmark", id: "bk-1" },
    "DELETE",
    {},
    caller
  );

  expect(result).toEqual({
    statusCode: 200,
    body: { deleted: "bk-1" },
  });
  expect(deleteBookmark).toHaveBeenCalledWith("user-sub-1", "bk-1");
});

test("POST /share creates a dashboard share link using the forwarded origin", async () => {
  (createDashboardShareCode as jest.Mock).mockResolvedValue({
    code: "dash1234",
    expiresAt: new Date("2026-03-18T00:00:00.000Z"),
  });

  const result = await handleSessionRoute(
    { type: "shares" },
    "POST",
    {
      headers: { origin: "https://app.example.com" },
      body: JSON.stringify({
        weekStart: "2026-03-01",
        weekEnd: "2026-03-07",
        weekLabel: "2026 March Week 1",
      }),
    },
    caller
  );

  expect(result.statusCode).toBe(200);
  expect(result.body).toMatchObject({
    code: "dash1234",
    url: "https://app.example.com/share/dash1234",
  });
  expect((result.body as { expiresAt: string }).expiresAt).toMatch(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
  );
  expect(createDashboardShareCode).toHaveBeenCalledWith(expect.any(String), expect.any(Date));
});

test("GET /share/{code} returns a dashboard share payload from stored JWT", async () => {
  const jwt = await signShareToken({
    weekStart: "2026-03-01",
    weekEnd: "2026-03-07",
    weekLabel: "2026 March Week 1",
  });
  (resolveDashboardShareCode as jest.Mock).mockResolvedValue({
    status: "ok",
    entry: {
      jwt,
      expiresAt: "2026-03-18T00:00:00.000Z",
    },
  });

  const result = await handleSessionRoute(
    { type: "dashboardShare", code: "dash1234" },
    "GET",
    {},
    null
  );

  expect(result).toEqual({
    statusCode: 200,
    body: {
      weekStart: "2026-03-01",
      weekEnd: "2026-03-07",
      weekLabel: "2026 March Week 1",
      expiresAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    },
  });
  expect(resolveDashboardShareCode).toHaveBeenCalledWith("dash1234");
});

test("GET /share/{code} accepts legacy token fallback when storage is unavailable", async () => {
  (hasSessionBucket as jest.Mock).mockReturnValue(false);
  const jwt = await signShareToken({
    weekStart: "2026-03-01",
    weekEnd: "2026-03-07",
    weekLabel: "2026 March Week 1",
  });

  const result = await handleSessionRoute(
    { type: "dashboardShare", code: "dash1234" },
    "GET",
    { queryStringParameters: { token: jwt } },
    null
  );

  expect(result.statusCode).toBe(200);
  expect(result.body).toMatchObject({
    weekStart: "2026-03-01",
    weekEnd: "2026-03-07",
    weekLabel: "2026 March Week 1",
  });
});

test("POST /sessions validates required fields", async () => {
  const result = await handleSessionRoute(
    { type: "sessions" },
    "POST",
    { body: JSON.stringify({ sessionId: "s1", title: "Title" }) },
    caller
  );

  expect(result).toEqual({
    statusCode: 400,
    body: { error: "sessionId, title, messages are required" },
  });
});

test("POST /sessions persists session data through storage", async () => {
  (saveSession as jest.Mock).mockResolvedValue({
    sessionId: "s1",
    title: "Title",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });

  const result = await handleSessionRoute(
    { type: "sessions" },
    "POST",
    { body: JSON.stringify({ sessionId: "s1", title: "Title", messages: [{ id: "m1" }] }) },
    caller
  );

  expect(result.statusCode).toBe(200);
  expect(saveSession).toHaveBeenCalledWith("user-sub-1", {
    sessionId: "s1",
    title: "Title",
    messages: [{ id: "m1" }],
  });
});

test("POST /sessions/{id}/share returns a frontend share URL using the forwarded origin", async () => {
  (getSession as jest.Mock).mockResolvedValue({
    sessionId: "s1",
    title: "Title",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    messages: [],
  });
  (createSessionShareCode as jest.Mock).mockResolvedValue({
    code: "abcd1234",
    expiresAt: new Date("2026-03-18T00:00:00.000Z"),
  });

  const result = await handleSessionRoute(
    { type: "sessionShare", id: "s1" },
    "POST",
    { headers: { origin: "https://app.example.com" } },
    caller
  );

  expect(result).toEqual({
    statusCode: 200,
    body: {
      code: "abcd1234",
      url: "https://app.example.com/share/session/abcd1234",
      expiresAt: "2026-03-18T00:00:00.000Z",
    },
  });
});

test("GET /share/session/{code} is public and returns stored session data", async () => {
  (resolveSessionShareCode as jest.Mock).mockResolvedValue({
    status: "ok",
    sessionData: {
      sessionId: "s1",
      title: "Shared",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      messages: [],
    },
    expiresAt: "2026-03-18T00:00:00.000Z",
  });

  const result = await handleSessionRoute(
    { type: "sharedSession", code: "abcd1234" },
    "GET",
    {},
    null
  );

  expect(result.statusCode).toBe(200);
  expect(resolveSessionShareCode).toHaveBeenCalledWith("abcd1234");
});

test("session routes return 503 when SESSION_BUCKET is unavailable", async () => {
  (hasSessionBucket as jest.Mock).mockReturnValue(false);

  const result = await handleSessionRoute({ type: "sessions" }, "GET", {}, caller);

  expect(result).toEqual({
    statusCode: 503,
    body: { error: "Session storage is unavailable. SESSION_BUCKET env var is not set." },
  });
});
