import { NextRequest, NextResponse } from "next/server";
import { signShareToken, getExpiresAt } from "@/lib/shareToken";
import { createCode } from "@/lib/shareCodeStore";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function errorResponse(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status });
}

function isIsoDateString(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE_PATTERN.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "Malformed JSON body.");
  }

  const { weekStart, weekEnd, weekLabel } = body as {
    weekStart?: unknown;
    weekEnd?: unknown;
    weekLabel?: unknown;
  };

  if (
    !isIsoDateString(weekStart) ||
    !isIsoDateString(weekEnd) ||
    !isNonEmptyString(weekLabel)
  ) {
    return errorResponse(
      400,
      "Malformed share request. weekStart and weekEnd must be YYYY-MM-DD, and weekLabel must be non-empty."
    );
  }

  try {
    const expiresAt = getExpiresAt();
    const jwt = await signShareToken({
      weekStart,
      weekEnd,
      weekLabel: weekLabel.trim(),
    });
    const code = createCode(jwt, expiresAt);

    const origin = req.headers.get("origin") ?? req.nextUrl.origin;
    const shareUrl = `${origin}/share/${code}?token=${encodeURIComponent(jwt)}`;

    return NextResponse.json({
      code,
      url: shareUrl,
      expiresAt: expiresAt.toISOString(),
    });
  } catch {
    return errorResponse(500, "Failed to create share link.");
  }
}
