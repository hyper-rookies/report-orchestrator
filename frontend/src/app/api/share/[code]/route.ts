import { NextRequest } from "next/server";
import { proxyOrchestratorRequest } from "@/lib/orchestratorProxy";

type Params = { params: Promise<{ code: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: Params
): Promise<Response> {
  const { code } = await params;
  return proxyOrchestratorRequest(req, `/share/${encodeURIComponent(code)}`);
}
