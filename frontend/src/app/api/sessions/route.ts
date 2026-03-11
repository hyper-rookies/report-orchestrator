import { NextRequest } from "next/server";
import { proxyOrchestratorRequest } from "@/lib/orchestratorProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  return proxyOrchestratorRequest(req, "/sessions");
}

export async function POST(req: NextRequest): Promise<Response> {
  return proxyOrchestratorRequest(req, "/sessions");
}
