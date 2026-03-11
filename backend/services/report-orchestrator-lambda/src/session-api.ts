import {
  type BookmarkFrame,
  createDashboardShareCode,
  createSessionShareCode,
  deleteBookmark,
  deleteSession,
  getBookmark,
  getSession,
  hasSessionBucket,
  listBookmarks,
  listSessions,
  renameSession,
  resolveDashboardShareCode,
  resolveSessionShareCode,
  saveBookmark,
  saveSession,
} from "./session-storage";
import {
  getExpiresAt,
  signShareToken,
  verifyShareToken,
} from "./share-token";

export interface AuthenticatedCaller {
  sub: string;
  email: string;
}

export interface HttpEventLike {
  rawPath?: string;
  rawQueryString?: string;
  path?: string;
  body?: string;
  isBase64Encoded?: boolean;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined>;
  requestContext?: {
    http?: {
      method?: string;
    };
  };
  httpMethod?: string;
}

export interface JsonResponse {
  statusCode: number;
  body: unknown;
}

export type ResolvedRoute =
  | { type: "stream" }
  | { type: "bookmarks" }
  | { type: "bookmark"; id: string }
  | { type: "shares" }
  | { type: "dashboardShare"; code: string }
  | { type: "sessions" }
  | { type: "session"; id: string }
  | { type: "sessionShare"; id: string }
  | { type: "sharedSession"; code: string }
  | { type: "notFound" };

const SHARE_CODE_PATTERN = /^[A-Za-z0-9_-]{8}$/;

function errorResponse(statusCode: number, error: string): JsonResponse {
  return { statusCode, body: { error } };
}

function normalizePath(path: string): string {
  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1);
  }
  return path || "/";
}

function getRequestBody(event: HttpEventLike): string {
  if (!event.body) {
    return "";
  }
  if (event.isBase64Encoded) {
    return Buffer.from(event.body, "base64").toString("utf-8");
  }
  return event.body;
}

function parseJsonBody(event: HttpEventLike): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(getRequestBody(event)) as unknown };
  } catch {
    return { ok: false };
  }
}

function isBookmarkFrame(value: unknown): value is BookmarkFrame {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const frame = value as { type?: unknown; data?: unknown };
  return (
    typeof frame.type === "string" &&
    !!frame.data &&
    typeof frame.data === "object" &&
    !Array.isArray(frame.data)
  );
}

function isIsoDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function getHeader(event: HttpEventLike, name: string): string | undefined {
  const headers = event.headers ?? {};
  const direct = headers[name];
  if (typeof direct === "string") {
    return direct;
  }

  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName && typeof value === "string") {
      return value;
    }
  }

  return undefined;
}

function getQueryParam(event: HttpEventLike, name: string): string | undefined {
  const direct = event.queryStringParameters?.[name];
  if (typeof direct === "string") {
    return direct;
  }

  if (typeof event.rawQueryString !== "string" || event.rawQueryString.length === 0) {
    return undefined;
  }

  const params = new URLSearchParams(event.rawQueryString);
  const value = params.get(name);
  return value === null ? undefined : value;
}

function getOrigin(event: HttpEventLike): string {
  return (
    getHeader(event, "origin") ??
    process.env.APP_URL ??
    process.env.FRONTEND_APP_URL ??
    ""
  );
}

function sessionStorageError(error: unknown, scope: string): JsonResponse {
  const detail = error instanceof Error ? error.message.trim() : "";
  return errorResponse(
    500,
    detail ? `${scope} request failed. ${detail}` : `${scope} request failed.`
  );
}

function getStorageUnavailableMessage(
  route: Exclude<ResolvedRoute, { type: "stream" } | { type: "notFound" }>
): string {
  if (route.type === "bookmarks" || route.type === "bookmark") {
    return "Bookmark storage is unavailable. SESSION_BUCKET env var is not set.";
  }
  if (route.type === "shares" || route.type === "dashboardShare") {
    return "Share storage is unavailable. SESSION_BUCKET env var is not set.";
  }

  return "Session storage is unavailable. SESSION_BUCKET env var is not set.";
}

function getStorageScope(
  route: Exclude<ResolvedRoute, { type: "stream" } | { type: "notFound" }>
): string {
  if (route.type === "bookmarks" || route.type === "bookmark") {
    return "Bookmark storage";
  }
  if (route.type === "shares" || route.type === "dashboardShare") {
    return "Share storage";
  }
  if (route.type === "sharedSession") {
    return "Session share storage";
  }
  return "Session storage";
}

export function getHttpMethod(event: HttpEventLike): string {
  return (
    event.requestContext?.http?.method ??
    event.httpMethod ??
    "GET"
  ).toUpperCase();
}

export function getRawPath(event: HttpEventLike): string {
  return normalizePath(event.rawPath ?? event.path ?? "/");
}

export function resolveRoute(path: string): ResolvedRoute {
  const normalizedPath = normalizePath(path);

  if (normalizedPath === "/") {
    return { type: "stream" };
  }
  if (normalizedPath === "/bookmarks") {
    return { type: "bookmarks" };
  }
  if (normalizedPath === "/share") {
    return { type: "shares" };
  }
  if (normalizedPath === "/sessions") {
    return { type: "sessions" };
  }

  const bookmarkMatch = normalizedPath.match(/^\/bookmarks\/([^/]+)$/);
  if (bookmarkMatch) {
    return { type: "bookmark", id: decodeURIComponent(bookmarkMatch[1]) };
  }

  const sessionShareMatch = normalizedPath.match(/^\/sessions\/([^/]+)\/share$/);
  if (sessionShareMatch) {
    return { type: "sessionShare", id: decodeURIComponent(sessionShareMatch[1]) };
  }

  const sessionMatch = normalizedPath.match(/^\/sessions\/([^/]+)$/);
  if (sessionMatch) {
    return { type: "session", id: decodeURIComponent(sessionMatch[1]) };
  }

  const sharedSessionMatch = normalizedPath.match(/^\/share\/session\/([^/]+)$/);
  if (sharedSessionMatch) {
    return { type: "sharedSession", code: decodeURIComponent(sharedSessionMatch[1]) };
  }

  const dashboardShareMatch = normalizedPath.match(/^\/share\/([^/]+)$/);
  if (dashboardShareMatch) {
    return { type: "dashboardShare", code: decodeURIComponent(dashboardShareMatch[1]) };
  }

  return { type: "notFound" };
}

export function requiresAuthentication(route: ResolvedRoute): boolean {
  return route.type !== "sharedSession" && route.type !== "dashboardShare" && route.type !== "notFound";
}

export async function handleSessionRoute(
  route: Exclude<ResolvedRoute, { type: "stream" } | { type: "notFound" }>,
  method: string,
  event: HttpEventLike,
  caller: AuthenticatedCaller | null
): Promise<JsonResponse> {
  const fallbackShareToken = route.type === "dashboardShare" ? getQueryParam(event, "token") : undefined;
  if (
    route.type === "dashboardShare" &&
    typeof fallbackShareToken === "string" &&
    fallbackShareToken.trim().length === 0
  ) {
    return errorResponse(400, "Malformed share token.");
  }
  const allowDashboardShareTokenFallback =
    route.type === "dashboardShare" &&
    typeof fallbackShareToken === "string" &&
    fallbackShareToken.trim().length > 0;

  if (!hasSessionBucket() && !allowDashboardShareTokenFallback) {
    return errorResponse(503, getStorageUnavailableMessage(route));
  }

  if (route.type !== "sharedSession" && route.type !== "dashboardShare" && !caller) {
    return errorResponse(401, "Unauthorized");
  }

  try {
    if (route.type === "shares") {
      if (method !== "POST") {
        return errorResponse(405, "Method not allowed");
      }

      const parsed = parseJsonBody(event);
      if (!parsed.ok) {
        return errorResponse(400, "Malformed JSON body.");
      }

      const { weekStart, weekEnd, weekLabel } = parsed.value as {
        weekStart?: unknown;
        weekEnd?: unknown;
        weekLabel?: unknown;
      };

      if (
        !isIsoDateString(weekStart) ||
        !isIsoDateString(weekEnd) ||
        !isNonEmptyString(weekLabel)
      ) {
        return errorResponse(
          400,
          "Malformed share request. weekStart and weekEnd must be YYYY-MM-DD, and weekLabel must be non-empty."
        );
      }

      const expiresAt = getExpiresAt();
      const jwt = await signShareToken({
        weekStart,
        weekEnd,
        weekLabel: weekLabel.trim(),
      });
      const { code } = await createDashboardShareCode(jwt, expiresAt);
      const origin = getOrigin(event);
      const url = origin ? `${origin}/share/${code}` : `/share/${code}`;

      return {
        statusCode: 200,
        body: { code, url, expiresAt: expiresAt.toISOString() },
      };
    }

    if (route.type === "dashboardShare") {
      if (method !== "GET") {
        return errorResponse(405, "Method not allowed");
      }
      if (!SHARE_CODE_PATTERN.test(route.code)) {
        return errorResponse(400, "Malformed share code.");
      }

      const entryResult = hasSessionBucket()
        ? await resolveDashboardShareCode(route.code)
        : { status: "missing" as const };

      if (entryResult.status === "ok") {
        const storedTokenResult = await verifyShareToken(entryResult.entry.jwt);
        if (storedTokenResult.status === "ok") {
          return { statusCode: 200, body: storedTokenResult.payload };
        }
        if (storedTokenResult.status === "expired") {
          return errorResponse(410, "Share token has expired.");
        }
      }

      if (typeof fallbackShareToken === "string") {
        const tokenResult = await verifyShareToken(fallbackShareToken);
        if (tokenResult.status === "ok") {
          return { statusCode: 200, body: tokenResult.payload };
        }
        if (tokenResult.status === "expired") {
          return errorResponse(410, "Share token has expired.");
        }
        return errorResponse(400, "Malformed share token.");
      }

      if (entryResult.status === "expired") {
        return errorResponse(410, "Share link has expired.");
      }
      if (entryResult.status === "missing") {
        return errorResponse(404, "Share code was not found.");
      }

      return errorResponse(410, "Share link is no longer available.");
    }

    if (route.type === "bookmarks") {
      if (method === "GET") {
        return { statusCode: 200, body: await listBookmarks(caller!.sub) };
      }

      if (method === "POST") {
        const parsed = parseJsonBody(event);
        if (!parsed.ok) {
          return errorResponse(400, "Invalid JSON");
        }

        const { prompt, frames } = parsed.value as { prompt?: unknown; frames?: unknown };
        if (
          typeof prompt !== "string" ||
          prompt.trim().length === 0 ||
          !Array.isArray(frames) ||
          !frames.every(isBookmarkFrame)
        ) {
          return errorResponse(400, "prompt and frames are required");
        }

        const bookmark = await saveBookmark(caller!.sub, {
          prompt,
          frames: frames as BookmarkFrame[],
        });

        return { statusCode: 201, body: { bookmarkId: bookmark.bookmarkId } };
      }

      return errorResponse(405, "Method not allowed");
    }

    if (route.type === "bookmark") {
      if (method === "GET") {
        const bookmark = await getBookmark(caller!.sub, route.id);
        return bookmark ? { statusCode: 200, body: bookmark } : errorResponse(404, "Not found");
      }

      if (method === "DELETE") {
        await deleteBookmark(caller!.sub, route.id);
        return { statusCode: 200, body: { deleted: route.id } };
      }

      return errorResponse(405, "Method not allowed");
    }

    if (route.type === "sessions") {
      if (method === "GET") {
        return { statusCode: 200, body: await listSessions(caller!.sub) };
      }
      if (method === "POST") {
        const parsed = parseJsonBody(event);
        if (!parsed.ok) {
          return errorResponse(400, "Invalid JSON");
        }

        const { sessionId, title, messages } = parsed.value as {
          sessionId?: unknown;
          title?: unknown;
          messages?: unknown;
        };

        if (
          typeof sessionId !== "string" ||
          typeof title !== "string" ||
          !Array.isArray(messages)
        ) {
          return errorResponse(400, "sessionId, title, messages are required");
        }

        return {
          statusCode: 200,
          body: await saveSession(caller!.sub, { sessionId, title, messages }),
        };
      }

      return errorResponse(405, "Method not allowed");
    }

    if (route.type === "session") {
      if (method === "GET") {
        const session = await getSession(caller!.sub, route.id);
        return session ? { statusCode: 200, body: session } : errorResponse(404, "Not found");
      }

      if (method === "PATCH") {
        const parsed = parseJsonBody(event);
        if (!parsed.ok) {
          return errorResponse(400, "Invalid JSON");
        }

        const { title } = parsed.value as { title?: unknown };
        if (typeof title !== "string" || title.trim().length === 0) {
          return errorResponse(400, "title is required");
        }

        const updated = await renameSession(caller!.sub, route.id, title);
        return updated ? { statusCode: 200, body: updated } : errorResponse(404, "Not found");
      }

      if (method === "DELETE") {
        await deleteSession(caller!.sub, route.id);
        return { statusCode: 200, body: { deleted: route.id } };
      }

      return errorResponse(405, "Method not allowed");
    }

    if (route.type === "sessionShare") {
      if (method !== "POST") {
        return errorResponse(405, "Method not allowed");
      }
      if (route.id.trim().length === 0) {
        return errorResponse(400, "Malformed session id.");
      }

      const session = await getSession(caller!.sub, route.id);
      if (!session) {
        return errorResponse(404, "Session was not found.");
      }

      const { code, expiresAt } = await createSessionShareCode(session);
      const origin = getOrigin(event);
      const url = origin
        ? `${origin}/share/session/${code}`
        : `/share/session/${code}`;

      return {
        statusCode: 200,
        body: { code, url, expiresAt: expiresAt.toISOString() },
      };
    }

    if (method !== "GET") {
      return errorResponse(405, "Method not allowed");
    }
    if (!SHARE_CODE_PATTERN.test(route.code)) {
      return errorResponse(400, "Malformed share code.");
    }

    const sessionResult = await resolveSessionShareCode(route.code);
    if (sessionResult.status === "ok") {
      return { statusCode: 200, body: sessionResult.sessionData };
    }
    if (sessionResult.status === "expired") {
      return errorResponse(410, "Share link has expired.");
    }
    return errorResponse(404, "Share code was not found.");
  } catch (error) {
    return sessionStorageError(error, getStorageScope(route));
  }
}
