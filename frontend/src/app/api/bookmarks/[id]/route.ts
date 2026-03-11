import { NextRequest, NextResponse } from "next/server";

import { deleteBookmark, getBookmarkItem, hasSessionBucket } from "@/lib/bookmarkS3";
import { getUserSub } from "@/lib/sessionAuth";

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
      { error: "Storage unavailable" },
      { status: 503 }
    );
  }

  const { id } = await params;
  const item = await getBookmarkItem(sub, id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(item);
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
      { error: "Storage unavailable" },
      { status: 503 }
    );
  }

  const { id } = await params;
  await deleteBookmark(sub, id);
  return NextResponse.json({ deleted: id });
}
