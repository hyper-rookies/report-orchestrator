import { NextRequest, NextResponse } from "next/server";
import { verifyShareToken } from "@/lib/shareToken";
import { hasShareStore, resolveCodeEntry } from "@/lib/shareCodeStore";

const SHARE_CODE_PATTERN = /^[A-Za-z0-9_-]{8}$/;

function errorResponse(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status });
}

function successResponse(payload: {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  expiresAt: string;
}): NextResponse {
  return NextResponse.json({
    weekStart: payload.weekStart,
    weekEnd: payload.weekEnd,
    weekLabel: payload.weekLabel,
    expiresAt: payload.expiresAt,
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
): Promise<NextResponse> {
  const { code } = await params;
  if (!SHARE_CODE_PATTERN.test(code)) {
    return errorResponse(400, "Malformed share code.");
  }

  const fallbackToken = req.nextUrl.searchParams.get("token");
  if (fallbackToken !== null && fallbackToken.trim().length === 0) {
    return errorResponse(400, "Malformed share token.");
  }

  try {
    const entryResult = hasShareStore()
      ? await resolveCodeEntry(code)
      : { status: "missing" as const };

    if (entryResult.status === "ok") {
      const storedTokenResult = await verifyShareToken(entryResult.entry.jwt);
      if (storedTokenResult.status === "ok") {
        return successResponse(storedTokenResult.payload);
      }

      if (storedTokenResult.status === "expired") {
        return errorResponse(410, "Share token has expired.");
      }
    }

    if (!hasShareStore() && fallbackToken === null) {
      return errorResponse(503, "Share storage is unavailable.");
    }

    if (fallbackToken !== null) {
      const tokenResult = await verifyShareToken(fallbackToken);
      if (tokenResult.status === "ok") {
        return successResponse(tokenResult.payload);
      }

      if (tokenResult.status === "expired") {
        return errorResponse(410, "Share token has expired.");
      }

      return errorResponse(400, "Malformed share token.");
    }

    if (entryResult.status === "expired") {
      return errorResponse(410, "Share link has expired.");
    }

    if (entryResult.status === "missing") {
      return errorResponse(404, "Share code was not found.");
    }

    return errorResponse(410, "Share link is no longer available.");
  } catch {
    return errorResponse(500, "Failed to resolve share link.");
  }
}
