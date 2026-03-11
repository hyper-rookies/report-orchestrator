import { NextRequest, NextResponse } from "next/server";
import { getUserSub } from "@/lib/sessionAuth";
import { hasSessionBucket, sessionKey, s3GetJson } from "@/lib/sessionS3";
import { createSessionShareCode, hasSessionShareStore } from "@/lib/sessionShareStore";
import { storageErrorResponse } from "@/lib/storageApiError";
import type { SessionData } from "@/types/session";

type Params = { params: Promise<{ id: string }> };

function errorResponse(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status });
}

export async function POST(
  req: NextRequest,
  { params }: Params
): Promise<NextResponse> {
  const sub = await getUserSub(req);
  if (!sub) {
    return errorResponse(401, "Unauthorized");
  }

  if (!hasSessionBucket()) {
    return errorResponse(503, "Session storage is unavailable. SESSION_BUCKET env var is not set.");
  }
  if (!hasSessionShareStore()) {
    return errorResponse(503, "Session share storage is unavailable.");
  }

  const { id } = await params;
  if (id.trim().length === 0) {
    return errorResponse(400, "Malformed session id.");
  }

  try {
    const session = await s3GetJson<SessionData>(sessionKey(sub, id));
    if (!session) {
      return errorResponse(404, "Session was not found.");
    }

    const { code, expiresAt } = await createSessionShareCode(session);
    const origin = req.headers.get("origin") ?? req.nextUrl.origin;

    return NextResponse.json({
      code,
      url: `${origin}/share/session/${code}`,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    return storageErrorResponse("Session share storage", error);
  }
}
