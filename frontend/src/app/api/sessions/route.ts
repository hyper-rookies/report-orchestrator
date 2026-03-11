import { NextRequest, NextResponse } from "next/server";
import { getUserSub } from "@/lib/sessionAuth";
import { hasSessionBucket, indexKey, s3GetJson, s3PutJson, sessionKey } from "@/lib/sessionS3";
import { storageErrorResponse } from "@/lib/storageApiError";
import type { SessionData, SessionMeta } from "@/types/session";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sub = await getUserSub(req);
  if (!sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasSessionBucket()) {
    return NextResponse.json(
      { error: "Session storage is unavailable. SESSION_BUCKET env var is not set." },
      { status: 503 }
    );
  }

  try {
    const index = (await s3GetJson<SessionMeta[]>(indexKey(sub))) ?? [];
    const sorted = [...index].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return NextResponse.json(sorted);
  } catch (error) {
    return storageErrorResponse("Session storage", error);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sub = await getUserSub(req);
  if (!sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasSessionBucket()) {
    return NextResponse.json(
      { error: "Session storage is unavailable. SESSION_BUCKET env var is not set." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { sessionId, title, messages } = body as {
    sessionId?: unknown;
    title?: unknown;
    messages?: unknown;
  };

  if (
    typeof sessionId !== "string" ||
    typeof title !== "string" ||
    !Array.isArray(messages)
  ) {
    return NextResponse.json(
      { error: "sessionId, title, messages are required" },
      { status: 400 }
    );
  }

  try {
    const now = new Date().toISOString();
    const index = (await s3GetJson<SessionMeta[]>(indexKey(sub))) ?? [];
    const existing = index.find((session) => session.sessionId === sessionId);

    const meta: SessionMeta = {
      sessionId,
      title,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const sessionData: SessionData = {
      ...meta,
      messages: messages as SessionData["messages"],
    };

    await s3PutJson(sessionKey(sub, sessionId), sessionData);

    const newIndex = [...index.filter((session) => session.sessionId !== sessionId), meta];
    await s3PutJson(indexKey(sub), newIndex);

    return NextResponse.json(meta);
  } catch (error) {
    return storageErrorResponse("Session storage", error);
  }
}
