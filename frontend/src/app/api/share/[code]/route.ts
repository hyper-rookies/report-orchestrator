import { NextRequest, NextResponse } from "next/server";
import { verifyShareToken } from "@/lib/shareToken";
import { resolveCodeEntry } from "@/lib/shareCodeStore";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
): Promise<NextResponse> {
  const { code } = await params;
  const entry = resolveCodeEntry(code);
  const fallbackToken = req.nextUrl.searchParams.get("token");
  const token = entry?.jwt ?? fallbackToken;

  if (!token) {
    return NextResponse.json(
      { error: "Share link not found or expired." },
      { status: 404 }
    );
  }

  const payload = await verifyShareToken(token);
  if (!payload) {
    return NextResponse.json(
      { error: "Share token is invalid or expired." },
      { status: 410 }
    );
  }

  return NextResponse.json({
    weekStart: payload.weekStart,
    weekEnd: payload.weekEnd,
    weekLabel: payload.weekLabel,
    expiresAt: payload.expiresAt,
  });
}
