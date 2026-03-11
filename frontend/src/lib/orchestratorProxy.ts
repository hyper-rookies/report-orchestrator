import { NextRequest, NextResponse } from "next/server";

const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL ?? process.env.NEXT_PUBLIC_SSE_URL ?? "";

function getUpstreamUrl(path: string): string {
  return new URL(path, ORCHESTRATOR_URL).toString();
}

export async function proxyOrchestratorRequest(
  req: NextRequest,
  path: string
): Promise<Response> {
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
  for (const headerName of ["authorization", "content-type", "origin"]) {
    const value = req.headers.get(headerName);
    if (value) {
      headers.set(headerName, value);
    }
  }

  try {
    const upstreamUrl = new URL(getUpstreamUrl(path));
    upstreamUrl.search = req.nextUrl.search;

    const upstream = await fetch(upstreamUrl.toString(), {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.text(),
      cache: "no-store",
    });

    const responseHeaders = new Headers();
    const contentType = upstream.headers.get("content-type");
    const cacheControl = upstream.headers.get("cache-control");
    if (contentType) {
      responseHeaders.set("content-type", contentType);
    }
    if (cacheControl) {
      responseHeaders.set("cache-control", cacheControl);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const detail =
      error instanceof Error && error.message.trim().length > 0 ? ` ${error.message}` : "";

    return NextResponse.json(
      { error: `Failed to reach orchestrator.${detail}`.trim() },
      { status: 502 }
    );
  }
}
