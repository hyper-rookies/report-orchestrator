import { nanoid } from "nanoid";
import { NextRequest, NextResponse } from "next/server";

import { hasSessionBucket, listBookmarks, saveBookmark } from "@/lib/bookmarkS3";
import { getUserSub } from "@/lib/sessionAuth";
import type { BookmarkItem } from "@/types/bookmark";

function isFrame(
  value: unknown
): value is BookmarkItem["frames"][number] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const frame = value as { type?: unknown; data?: unknown };
  return (
    typeof frame.type === "string" &&
    typeof frame.data === "object" &&
    frame.data !== null &&
    !Array.isArray(frame.data)
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sub = getUserSub(req);
  if (!sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasSessionBucket()) {
    return NextResponse.json([]);
  }

  const list = await listBookmarks(sub);
  return NextResponse.json(list);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sub = getUserSub(req);
  if (!sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasSessionBucket()) {
    return NextResponse.json(
      { error: "Storage unavailable" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { prompt, frames } = body as { prompt?: unknown; frames?: unknown };
  if (
    typeof prompt !== "string" ||
    prompt.trim().length === 0 ||
    !Array.isArray(frames) ||
    !frames.every(isFrame)
  ) {
    return NextResponse.json(
      { error: "prompt and frames are required" },
      { status: 400 }
    );
  }

  const normalizedPrompt = prompt.trim();
  const bookmarkFrames = frames as BookmarkItem["frames"];
  const chartFrame = bookmarkFrames.findLast((frame) => frame.type === "chart");
  const tableFrame = bookmarkFrames.findLast((frame) => frame.type === "table");
  const rawSpec = chartFrame?.data.spec as Record<string, unknown> | undefined;

  const previewType: BookmarkItem["previewType"] = chartFrame
    ? "chart"
    : tableFrame
      ? "table"
      : "text";
  const chartType = typeof rawSpec?.type === "string" ? rawSpec.type : undefined;

  const item: BookmarkItem = {
    bookmarkId: nanoid(),
    title: normalizedPrompt.slice(0, 60),
    prompt: normalizedPrompt,
    previewType,
    chartType,
    createdAt: new Date().toISOString(),
    frames: bookmarkFrames,
  };

  await saveBookmark(sub, item);
  return NextResponse.json({ bookmarkId: item.bookmarkId }, { status: 201 });
}
