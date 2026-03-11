jest.mock("../src/session-storage", () => ({
  createSessionShareCode: jest.fn(),
  deleteBookmark: jest.fn(),
  deleteSession: jest.fn(),
  getBookmark: jest.fn(),
  getSession: jest.fn(),
  hasSessionBucket: jest.fn(),
  listBookmarks: jest.fn(),
  listSessions: jest.fn(),
  renameSession: jest.fn(),
  resolveSessionShareCode: jest.fn(),
  saveBookmark: jest.fn(),
  saveSession: jest.fn(),
}));

import {
  handleSessionRoute,
  resolveRoute,
  type AuthenticatedCaller,
} from "../src/session-api";
import {
  createSessionShareCode,
  deleteBookmark,
  getBookmark,
  getSession,
  hasSessionBucket,
  listBookmarks,
  listSessions,
  resolveSessionShareCode,
  saveBookmark,
  saveSession,
} from "../src/session-storage";

const caller: AuthenticatedCaller = { sub: "user-sub-1", email: "user@example.com" };

beforeEach(() => {
  jest.resetAllMocks();
  (hasSessionBucket as jest.Mock).mockReturnValue(true);
});

test("resolveRoute parses session collection, item, share, and public share paths", () => {
  expect(resolveRoute("/bookmarks")).toEqual({ type: "bookmarks" });
  expect(resolveRoute("/bookmarks/bk-123")).toEqual({ type: "bookmark", id: "bk-123" });
  expect(resolveRoute("/sessions")).toEqual({ type: "sessions" });
  expect(resolveRoute("/sessions/abc")).toEqual({ type: "session", id: "abc" });
  expect(resolveRoute("/sessions/abc/share")).toEqual({ type: "sessionShare", id: "abc" });
  expect(resolveRoute("/share/session/code1234")).toEqual({
    type: "sharedSession",
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
