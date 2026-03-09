import { NextRequest, NextResponse } from "next/server";
import { signShareToken, getExpiresAt } from "@/lib/shareToken";
import { createCode } from "@/lib/shareCodeStore";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { weekStart, weekEnd, weekLabel } = body as {
    weekStart?: unknown;
    weekEnd?: unknown;
    weekLabel?: unknown;
  };

  if (
    typeof weekStart !== "string" ||
    typeof weekEnd !== "string" ||
    typeof weekLabel !== "string"
  ) {
    return NextResponse.json(
      { error: "weekStart, weekEnd, weekLabel are required strings" },
      { status: 400 }
    );
  }

  const expiresAt = getExpiresAt();
  const jwt = await signShareToken({ weekStart, weekEnd, weekLabel });
  const code = createCode(jwt, expiresAt);

  const origin = req.headers.get("origin") ?? req.nextUrl.origin;
  const shareUrl = `${origin}/share/${code}`;

  return NextResponse.json({
    code,
    url: shareUrl,
    expiresAt: expiresAt.toISOString(),
  });
}
