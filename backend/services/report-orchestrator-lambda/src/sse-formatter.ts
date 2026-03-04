import { randomUUID } from "crypto";

export type SseEventType = "meta" | "progress" | "table" | "chart" | "final" | "error";

export function formatSseEvent(type: SseEventType, data: object): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function utcNow(): string {
  return new Date().toISOString();
}

export function generateReportId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `rpt-${date}-${randomUUID().replace(/-/g, "").slice(0, 6)}`;
}
