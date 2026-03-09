import { NextRequest, NextResponse } from "next/server";
import { resolveSessionShareCode } from "@/lib/sessionShareStore";

type Params = { params: Promise<{ code: string }> };

export async function GET(
  _req: NextRequest,
  { params }: Params
): Promise<NextResponse> {
  const { code } = await params;
  const sessionData = resolveSessionShareCode(code);

  if (!sessionData) {
    return NextResponse.json(
      { error: "Share link not found or expired." },
      { status: 404 }
    );
  }

  return NextResponse.json(sessionData);
}
