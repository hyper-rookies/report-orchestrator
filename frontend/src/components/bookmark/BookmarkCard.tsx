import { useState, type ElementType } from "react";
import Link from "next/link";
import { BarChart2, Download, MessageSquare, PieChart, Table2, Trash2 } from "lucide-react";

import { getBookmark } from "@/lib/bookmarkClient";
import { extractBookmarkCsvRows } from "@/lib/bookmarkExport";
import { downloadCsv } from "@/lib/exportCsv";
import { cn } from "@/lib/utils";
import type { BookmarkMeta } from "@/types/bookmark";

const CHART_ICONS: Record<string, ElementType> = {
  pie: PieChart,
  bar: BarChart2,
  stackedBar: BarChart2,
  line: BarChart2,
};

interface BookmarkCardProps {
  meta: BookmarkMeta;
  deleting?: boolean;
  onDelete: (id: string) => void;
}

export default function BookmarkCard({ meta, deleting = false, onDelete }: BookmarkCardProps) {
  const [downloading, setDownloading] = useState(false);
  const Icon =
    meta.previewType === "chart"
      ? (CHART_ICONS[meta.chartType ?? ""] ?? BarChart2)
      : meta.previewType === "table"
        ? Table2
        : MessageSquare;

  const dateLabel = new Date(meta.createdAt).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const handleDownload = async () => {
    if (deleting || downloading) {
      return;
    }

    setDownloading(true);
    try {
      const item = await getBookmark(meta.bookmarkId);
      if (!item) {
        return;
      }

      const rows = extractBookmarkCsvRows(item);
      if (rows.length === 0) {
        return;
      }

      downloadCsv(rows, `bookmark-${meta.bookmarkId}.csv`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="nhn-panel group relative flex flex-col gap-3 p-4 transition hover:border-primary/30">
      <Link
        href={`/bookmarks/${meta.bookmarkId}`}
        className={cn("flex flex-1 flex-col gap-3", deleting && "pointer-events-none opacity-80")}
        aria-disabled={deleting}
        tabIndex={deleting ? -1 : undefined}
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-5 w-5 shrink-0" />
          {meta.chartType && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
              {meta.chartType}
            </span>
          )}
        </div>
        <p className="line-clamp-3 flex-1 text-sm text-foreground">{meta.prompt}</p>
        <p className="text-xs text-muted-foreground">{dateLabel}</p>
      </Link>

      <div className="absolute right-2 top-2 hidden items-center gap-1 group-hover:flex">
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            void handleDownload();
          }}
          disabled={deleting || downloading}
          className="rounded p-1 text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          title={downloading ? "CSV 다운로드 중" : "CSV 다운로드"}
          aria-label={downloading ? "CSV 다운로드 중" : "CSV 다운로드"}
        >
          <Download className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            onDelete(meta.bookmarkId);
          }}
          disabled={deleting || downloading}
          className="rounded p-1 text-muted-foreground transition hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
          title={deleting ? "삭제 중" : "삭제"}
          aria-label={deleting ? "북마크 삭제 중" : "북마크 삭제"}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
