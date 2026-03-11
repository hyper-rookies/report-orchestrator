import { randomBytes, randomUUID } from "crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export interface SessionMeta {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionData extends SessionMeta {
  messages: unknown[];
}

export interface BookmarkFrame {
  type: string;
  data: Record<string, unknown>;
}

export interface BookmarkMeta {
  bookmarkId: string;
  title: string;
  prompt: string;
  previewType: "chart" | "table" | "text";
  chartType?: string;
  createdAt: string;
}

export interface BookmarkItem extends BookmarkMeta {
  frames: BookmarkFrame[];
}

interface SessionShareEntry {
  sessionData: SessionData;
  expiresAt: number;
}

export type ResolveSessionShareCodeResult =
  | { status: "ok"; sessionData: SessionData; expiresAt: string }
  | { status: "expired" }
  | { status: "missing" };

const SESSION_SHARE_TTL_SECONDS = 7 * 24 * 60 * 60;

function getClient(): S3Client {
  return new S3Client({ region: process.env.AWS_REGION ?? "ap-northeast-2" });
}

export function hasSessionBucket(): boolean {
  return typeof process.env.SESSION_BUCKET === "string" && process.env.SESSION_BUCKET.trim().length > 0;
}

function getBucket(): string {
  const bucket = process.env.SESSION_BUCKET;
  if (!bucket) {
    throw new Error("SESSION_BUCKET env var is not set.");
  }
  return bucket;
}

async function s3GetJson<T>(key: string): Promise<T | null> {
  try {
    const response = await getClient().send(
      new GetObjectCommand({ Bucket: getBucket(), Key: key })
    );
    const body = await response.Body?.transformToString("utf-8");
    if (!body) {
      return null;
    }
    return JSON.parse(body) as T;
  } catch (error: unknown) {
    if ((error as { name?: string }).name === "NoSuchKey") {
      return null;
    }
    throw error;
  }
}

async function s3PutJson(key: string, data: unknown): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: "application/json",
    })
  );
}

async function s3Delete(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}

const indexKey = (sub: string) => `sessions/${sub}/index.json`;
const sessionKey = (sub: string, id: string) => `sessions/${sub}/${id}.json`;
const sessionShareCodeKey = (code: string) => `shares/session/${code}.json`;
const bookmarkIndexKey = (sub: string) => `bookmarks/${sub}/index.json`;
const bookmarkItemKey = (sub: string, id: string) => `bookmarks/${sub}/${id}.json`;

export async function listSessions(sub: string): Promise<SessionMeta[]> {
  const index = (await s3GetJson<SessionMeta[]>(indexKey(sub))) ?? [];
  return [...index].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function saveSession(
  sub: string,
  input: { sessionId: string; title: string; messages: unknown[] }
): Promise<SessionMeta> {
  const now = new Date().toISOString();
  const index = (await s3GetJson<SessionMeta[]>(indexKey(sub))) ?? [];
  const existing = index.find((session) => session.sessionId === input.sessionId);

  const meta: SessionMeta = {
    sessionId: input.sessionId,
    title: input.title,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const sessionData: SessionData = {
    ...meta,
    messages: input.messages,
  };

  await s3PutJson(sessionKey(sub, input.sessionId), sessionData);
  await s3PutJson(
    indexKey(sub),
    [...index.filter((session) => session.sessionId !== input.sessionId), meta]
  );

  return meta;
}

export async function getSession(sub: string, sessionId: string): Promise<SessionData | null> {
  return s3GetJson<SessionData>(sessionKey(sub, sessionId));
}

export async function renameSession(
  sub: string,
  sessionId: string,
  title: string
): Promise<{ sessionId: string; title: string; updatedAt: string } | null> {
  const session = await s3GetJson<SessionData>(sessionKey(sub, sessionId));
  if (!session) {
    return null;
  }

  const now = new Date().toISOString();
  const updatedTitle = title.trim();
  const updated: SessionData = {
    ...session,
    title: updatedTitle,
    updatedAt: now,
  };

  await s3PutJson(sessionKey(sub, sessionId), updated);

  const index = (await s3GetJson<SessionMeta[]>(indexKey(sub))) ?? [];
  await s3PutJson(
    indexKey(sub),
    index.map((entry) =>
      entry.sessionId === sessionId ? { ...entry, title: updatedTitle, updatedAt: now } : entry
    )
  );

  return { sessionId, title: updatedTitle, updatedAt: now };
}

export async function deleteSession(sub: string, sessionId: string): Promise<void> {
  await s3Delete(sessionKey(sub, sessionId));

  const index = (await s3GetJson<SessionMeta[]>(indexKey(sub))) ?? [];
  await s3PutJson(
    indexKey(sub),
    index.filter((entry) => entry.sessionId !== sessionId)
  );
}

export async function listBookmarks(sub: string): Promise<BookmarkMeta[]> {
  const index = (await s3GetJson<BookmarkMeta[]>(bookmarkIndexKey(sub))) ?? [];
  return [...index].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function saveBookmark(
  sub: string,
  input: { prompt: string; frames: BookmarkFrame[] }
): Promise<BookmarkItem> {
  const normalizedPrompt = input.prompt.trim();
  const bookmarkFrames = input.frames;
  let chartFrame: BookmarkFrame | undefined;
  let tableFrame: BookmarkFrame | undefined;
  for (let i = bookmarkFrames.length - 1; i >= 0; i -= 1) {
    const frame = bookmarkFrames[i];
    if (!chartFrame && frame.type === "chart") {
      chartFrame = frame;
    }
    if (!tableFrame && frame.type === "table") {
      tableFrame = frame;
    }
    if (chartFrame && tableFrame) {
      break;
    }
  }

  const rawSpec = chartFrame?.data.spec;
  const chartType =
    typeof rawSpec === "object" &&
    rawSpec !== null &&
    !Array.isArray(rawSpec) &&
    typeof (rawSpec as { type?: unknown }).type === "string"
      ? ((rawSpec as { type: string }).type)
      : undefined;

  const item: BookmarkItem = {
    bookmarkId: randomUUID(),
    title: normalizedPrompt.slice(0, 60),
    prompt: normalizedPrompt,
    previewType: chartFrame ? "chart" : tableFrame ? "table" : "text",
    chartType,
    createdAt: new Date().toISOString(),
    frames: bookmarkFrames,
  };

  await s3PutJson(bookmarkItemKey(sub, item.bookmarkId), item);

  const index = (await s3GetJson<BookmarkMeta[]>(bookmarkIndexKey(sub))) ?? [];
  const meta: BookmarkMeta = {
    bookmarkId: item.bookmarkId,
    title: item.title,
    prompt: item.prompt,
    previewType: item.previewType,
    chartType: item.chartType,
    createdAt: item.createdAt,
  };

  await s3PutJson(bookmarkIndexKey(sub), [
    ...index.filter((bookmark) => bookmark.bookmarkId !== item.bookmarkId),
    meta,
  ]);

  return item;
}

export async function getBookmark(sub: string, bookmarkId: string): Promise<BookmarkItem | null> {
  return s3GetJson<BookmarkItem>(bookmarkItemKey(sub, bookmarkId));
}

export async function deleteBookmark(sub: string, bookmarkId: string): Promise<void> {
  await s3Delete(bookmarkItemKey(sub, bookmarkId));

  const index = (await s3GetJson<BookmarkMeta[]>(bookmarkIndexKey(sub))) ?? [];
  await s3PutJson(
    bookmarkIndexKey(sub),
    index.filter((bookmark) => bookmark.bookmarkId !== bookmarkId)
  );
}

export async function createSessionShareCode(sessionData: SessionData): Promise<{
  code: string;
  expiresAt: Date;
}> {
  const code = randomBytes(12).toString("base64url").slice(0, 8);
  const expiresAt = new Date(Date.now() + SESSION_SHARE_TTL_SECONDS * 1000);

  await s3PutJson(sessionShareCodeKey(code), {
    sessionData,
    expiresAt: Math.floor(expiresAt.getTime() / 1000),
  });

  return { code, expiresAt };
}

export async function resolveSessionShareCode(
  code: string
): Promise<ResolveSessionShareCodeResult> {
  const entry = await s3GetJson<SessionShareEntry>(sessionShareCodeKey(code));

  if (!entry) {
    return { status: "missing" };
  }

  if (Math.floor(Date.now() / 1000) > entry.expiresAt) {
    await s3Delete(sessionShareCodeKey(code)).catch(() => undefined);
    return { status: "expired" };
  }

  return {
    status: "ok",
    sessionData: entry.sessionData,
    expiresAt: new Date(entry.expiresAt * 1000).toISOString(),
  };
}
