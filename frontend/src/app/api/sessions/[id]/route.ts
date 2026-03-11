import { NextRequest, NextResponse } from "next/server";
import { getUserSub } from "@/lib/sessionAuth";
import { hasSessionBucket, indexKey, s3Delete, s3GetJson, s3PutJson, sessionKey } from "@/lib/sessionS3";
import { storageErrorResponse } from "@/lib/storageApiError";
import type { SessionData, SessionMeta } from "@/types/session";

type Params = { params: Promise<{ id: string }> };

export async function GET(
  req: NextRequest,
  { params }: Params
): Promise<NextResponse> {
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
    const { id } = await params;
    const session = await s3GetJson<SessionData>(sessionKey(sub, id));
    if (!session) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(session);
  } catch (error) {
    return storageErrorResponse("Session storage", error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: Params
): Promise<NextResponse> {
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

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title } = body as { title?: unknown };
  if (typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  try {
    const session = await s3GetJson<SessionData>(sessionKey(sub, id));
    if (!session) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const updatedTitle = title.trim();
    const updated: SessionData = {
      ...session,
      title: updatedTitle,
      updatedAt: now,
    };

    await s3PutJson(sessionKey(sub, id), updated);

    const index = (await s3GetJson<SessionMeta[]>(indexKey(sub))) ?? [];
    const newIndex = index.map((entry) =>
      entry.sessionId === id ? { ...entry, title: updatedTitle, updatedAt: now } : entry
    );
    await s3PutJson(indexKey(sub), newIndex);

    return NextResponse.json({ sessionId: id, title: updatedTitle, updatedAt: now });
  } catch (error) {
    return storageErrorResponse("Session storage", error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: Params
): Promise<NextResponse> {
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
    const { id } = await params;

    await s3Delete(sessionKey(sub, id));

    const index = (await s3GetJson<SessionMeta[]>(indexKey(sub))) ?? [];
    await s3PutJson(
      indexKey(sub),
      index.filter((entry) => entry.sessionId !== id)
    );

    return NextResponse.json({ deleted: id });
  } catch (error) {
    return storageErrorResponse("Session storage", error);
  }
}
