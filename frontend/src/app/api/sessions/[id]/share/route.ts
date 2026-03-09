import { NextRequest, NextResponse } from "next/server";
import { getUserSub } from "@/lib/sessionAuth";
import { sessionKey, s3GetJson } from "@/lib/sessionS3";
import { createSessionShareCode } from "@/lib/sessionShareStore";
import type { SessionData } from "@/types/session";

type Params = { params: Promise<{ id: string }> };

export async function POST(
  req: NextRequest,
  { params }: Params
): Promise<NextResponse> {
  const sub = getUserSub(req);
  if (!sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const session = await s3GetJson<SessionData>(sessionKey(sub, id));
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { code, expiresAt } = createSessionShareCode(session);
  const origin = req.headers.get("origin") ?? req.nextUrl.origin;

  return NextResponse.json({
    code,
    url: `${origin}/share/session/${code}`,
    expiresAt: expiresAt.toISOString(),
  });
}
