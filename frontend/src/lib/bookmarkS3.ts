import type { BookmarkItem, BookmarkMeta } from "../types/bookmark";

async function loadSessionS3() {
  return import("./sessionS3");
}

export function hasSessionBucket(): boolean {
  return typeof process.env.SESSION_BUCKET === "string" && process.env.SESSION_BUCKET.trim().length > 0;
}

export const bookmarkIndexKey = (sub: string) => `bookmarks/${sub}/index.json`;
export const bookmarkItemKey = (sub: string, id: string) => `bookmarks/${sub}/${id}.json`;

export async function listBookmarks(sub: string): Promise<BookmarkMeta[]> {
  const { s3GetJson } = await loadSessionS3();
  const index = await s3GetJson<BookmarkMeta[]>(bookmarkIndexKey(sub));
  return (index ?? []).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function saveBookmark(sub: string, item: BookmarkItem): Promise<void> {
  const { s3GetJson, s3PutJson } = await loadSessionS3();
  await s3PutJson(bookmarkItemKey(sub, item.bookmarkId), item);

  const index = (await s3GetJson<BookmarkMeta[]>(bookmarkIndexKey(sub))) ?? [];
  const meta: BookmarkMeta = {
    bookmarkId: item.bookmarkId,
    title: item.title,
    prompt: item.prompt,
    previewType: item.previewType,
    chartType: item.chartType,
    createdAt: item.createdAt,
  };

  await s3PutJson(bookmarkIndexKey(sub), [
    ...index.filter((bookmark) => bookmark.bookmarkId !== item.bookmarkId),
    meta,
  ]);
}

export async function getBookmarkItem(sub: string, id: string): Promise<BookmarkItem | null> {
  const { s3GetJson } = await loadSessionS3();
  return s3GetJson<BookmarkItem>(bookmarkItemKey(sub, id));
}

export async function deleteBookmark(sub: string, id: string): Promise<void> {
  const { s3Delete, s3GetJson, s3PutJson } = await loadSessionS3();
  await s3Delete(bookmarkItemKey(sub, id));

  const index = (await s3GetJson<BookmarkMeta[]>(bookmarkIndexKey(sub))) ?? [];
  await s3PutJson(
    bookmarkIndexKey(sub),
    index.filter((bookmark) => bookmark.bookmarkId !== id)
  );
}
