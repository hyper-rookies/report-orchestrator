import { NextRequest, NextResponse } from "next/server";
import { verifyShareToken } from "@/lib/shareToken";
import { resolveCodeEntry } from "@/lib/shareCodeStore";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
): Promise<NextResponse> {
  const { code } = await params;
  const entry = resolveCodeEntry(code);

  if (!entry) {
    return NextResponse.json(
      { error: "Share link not found or expired." },
      { status: 404 }
    );
  }

  const payload = await verifyShareToken(entry.jwt);
  if (!payload) {
    return NextResponse.json(
      { error: "Share token is invalid or expired." },
      { status: 410 }
    );
  }

  return NextResponse.json({
    ...payload,
    expiresAt: entry.expiresAt,
  });
}
