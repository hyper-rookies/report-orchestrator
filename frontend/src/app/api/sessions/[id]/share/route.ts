import { NextRequest } from "next/server";
import { proxyOrchestratorRequest } from "@/lib/orchestratorProxy";

type Params = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: Params
): Promise<Response> {
  const { id } = await params;
  return proxyOrchestratorRequest(req, `/sessions/${encodeURIComponent(id)}/share`);
}
