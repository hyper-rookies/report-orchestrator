import { NextRequest, NextResponse } from "next/server";
import { verifyShareToken } from "@/lib/shareToken";
import { resolveCode } from "@/lib/shareCodeStore";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
): Promise<NextResponse> {
  const { code } = await params;
  const jwt = resolveCode(code);

  if (!jwt) {
    return NextResponse.json(
      { error: "Share link not found or expired." },
      { status: 404 }
    );
  }

  const payload = await verifyShareToken(jwt);
  if (!payload) {
    return NextResponse.json(
      { error: "Share token is invalid or expired." },
      { status: 410 }
    );
  }

  return NextResponse.json(payload);
}
