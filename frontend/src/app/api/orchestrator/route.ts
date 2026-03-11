import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL ?? process.env.NEXT_PUBLIC_SSE_URL ?? "";

export async function POST(req: NextRequest): Promise<Response> {
  if (!ORCHESTRATOR_URL) {
    return NextResponse.json(
      {
        error:
          "Orchestrator URL is not configured. Set ORCHESTRATOR_URL or NEXT_PUBLIC_SSE_URL.",
      },
      { status: 503 }
    );
  }

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  const authorization = req.headers.get("authorization");

  if (contentType) {
    headers.set("content-type", contentType);
  } else {
    headers.set("content-type", "application/json");
  }
  if (authorization) {
    headers.set("authorization", authorization);
  }

  try {
    const upstream = await fetch(ORCHESTRATOR_URL, {
      method: "POST",
      headers,
      body: await req.text(),
      cache: "no-store",
    });

    const responseHeaders = new Headers();
    responseHeaders.set(
      "content-type",
      upstream.headers.get("content-type") ?? "text/event-stream; charset=utf-8"
    );
    responseHeaders.set(
      "cache-control",
      upstream.headers.get("cache-control") ?? "no-cache, no-transform"
    );

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const detail =
      error instanceof Error && error.message.trim().length > 0 ? ` ${error.message}` : "";

    return NextResponse.json(
      {
        error: `Failed to reach orchestrator.${detail}`.trim(),
      },
      { status: 502 }
    );
  }
}
