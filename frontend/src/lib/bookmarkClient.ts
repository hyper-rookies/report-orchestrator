import { fetchAuthSession } from "aws-amplify/auth";

import type { SseFrame } from "@/hooks/useSse";
import type { BookmarkItem, BookmarkMeta } from "@/types/bookmark";

const USE_MOCK_AUTH = process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true";

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (USE_MOCK_AUTH) {
    return {};
  }

  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function getResponseErrorMessage(
  res: Response,
  fallback: string
): Promise<string> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body.error === "string" && body.error.trim().length > 0) {
        return body.error;
      }
    } catch {
      // Fall through to the fallback below.
    }
  }

  try {
    const text = await res.text();
    if (text.trim().length > 0) {
      return text;
    }
  } catch {
    // Fall through to the fallback below.
  }

  return fallback;
}

export async function listBookmarks(): Promise<BookmarkMeta[]> {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/bookmarks", { headers });
  if (!res.ok) {
    throw new Error(await getResponseErrorMessage(res, "Failed to load bookmarks"));
  }

  return res.json() as Promise<BookmarkMeta[]>;
}

export async function saveBookmark(prompt: string, frames: SseFrame[]): Promise<string> {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/bookmarks", {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt, frames }),
  });

  if (!res.ok) {
    throw new Error(await getResponseErrorMessage(res, "Failed to save bookmark"));
  }

  const body = (await res.json()) as { bookmarkId?: unknown };
  if (typeof body.bookmarkId !== "string" || body.bookmarkId.trim().length === 0) {
    throw new Error("Bookmark save response was missing bookmarkId");
  }

  return body.bookmarkId;
}

export async function getBookmark(id: string): Promise<BookmarkItem | null> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/bookmarks/${id}`, { headers });
  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error(await getResponseErrorMessage(res, "Failed to load bookmark"));
  }

  return res.json() as Promise<BookmarkItem>;
}

export async function deleteBookmark(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/bookmarks/${id}`, {
    method: "DELETE",
    headers,
  });

  if (!res.ok) {
    throw new Error(await getResponseErrorMessage(res, "Failed to delete bookmark"));
  }
}
