import { NextRequest, NextResponse } from "next/server";
import { resolveSessionShareCode } from "@/lib/sessionShareStore";

type Params = { params: Promise<{ code: string }> };

const SHARE_CODE_PATTERN = /^[A-Za-z0-9_-]{8}$/;

function errorResponse(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status });
}

export async function GET(
  _req: NextRequest,
  { params }: Params
): Promise<NextResponse> {
  const { code } = await params;
  if (!SHARE_CODE_PATTERN.test(code)) {
    return errorResponse(400, "Malformed share code.");
  }

  try {
    const sessionResult = resolveSessionShareCode(code);

    if (sessionResult.status === "ok") {
      return NextResponse.json(sessionResult.sessionData);
    }

    if (sessionResult.status === "expired") {
      return errorResponse(410, "Share link has expired.");
    }

    return errorResponse(404, "Share code was not found.");
  } catch {
    return errorResponse(500, "Failed to resolve share link.");
  }
}
