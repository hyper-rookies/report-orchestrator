import type { BookmarkItem } from "@/types/bookmark";

export function extractBookmarkCsvRows(item: Pick<BookmarkItem, "frames">): Record<string, unknown>[] {
  const chartFrame = [...item.frames].reverse().find((frame) => frame.type === "chart");
  const rawChartSpec = chartFrame?.data.spec as Record<string, unknown> | undefined;
  const chartRows = ((rawChartSpec?.data as Record<string, unknown>[] | undefined) ?? []).filter(
    (row) => typeof row === "object" && row !== null
  );
  if (chartRows.length > 0) {
    return chartRows;
  }

  const tableFrame = [...item.frames].reverse().find((frame) => frame.type === "table");
  return ((tableFrame?.data.rows as Record<string, unknown>[] | undefined) ?? []).filter(
    (row) => typeof row === "object" && row !== null
  );
}
