import type { SseFrame } from "@/hooks/useSse";

export interface BookmarkMeta {
  bookmarkId: string;
  title: string;
  prompt: string;
  previewType: "chart" | "table" | "text";
  chartType?: string;
  createdAt: string;
}

export interface BookmarkItem extends BookmarkMeta {
  frames: SseFrame[];
}
