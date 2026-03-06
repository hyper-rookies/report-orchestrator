"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";

interface DashboardData {
  totalSessions: number;
  totalInstalls: number;
  avgEngagementRate: number;
  channelShare: Array<{ name: string; value: number }>;
  trend: Array<{ date: string; sessions: number; installs: number }>;
  loading: boolean;
  error: string | null;
}

interface SseFrame {
  type: string;
  data: Record<string, unknown>;
}

const SSE_URL = process.env.NEXT_PUBLIC_SSE_URL ?? "";
const USE_MOCK_AUTH = process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true";

const INITIAL_DATA: DashboardData = {
  totalSessions: 0,
  totalInstalls: 0,
  avgEngagementRate: 0,
  channelShare: [],
  trend: [],
  loading: true,
  error: null,
};

function parseNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const normalized = value.replace(/,/g, "").replace(/%/g, "").trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeDateLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const isoMatch = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!isoMatch) return value;
  const [_, month, day] = value.split("-");
  return `${month}/${day}`;
}

async function getIdToken(): Promise<string | null> {
  if (USE_MOCK_AUTH) return null;
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}

function parseSseChunk(chunk: string): SseFrame[] {
  const normalized = chunk.replace(/\r\n/g, "\n");
  const events = normalized.split(/\n{2,}/).filter(Boolean);
  const frames: SseFrame[] = [];

  for (const event of events) {
    const lines = event.split("\n");
    const eventLine = lines.find((line) => line.startsWith("event:"));
    const dataLines = lines.filter((line) => line.startsWith("data:"));
    if (!eventLine || dataLines.length === 0) continue;

    try {
      frames.push({
        type: eventLine.slice(eventLine.indexOf(":") + 1).trim(),
        data: JSON.parse(
          dataLines
            .map((line) => line.slice(line.indexOf(":") + 1).trimStart())
            .join("\n")
            .trim()
        ),
      });
    } catch {
      // skip malformed frame
    }
  }

  return frames;
}

function extractRowsFromFrames(frames: SseFrame[]): Record<string, unknown>[] | null {
  for (const frame of frames) {
    if (frame.type === "error") {
      throw new Error((frame.data.message as string) ?? "SSE query failed.");
    }
    if (frame.type === "table") {
      const rows = frame.data.rows;
      if (Array.isArray(rows)) {
        return rows as Record<string, unknown>[];
      }
    }
  }
  return null;
}

async function runSseQuery(question: string): Promise<Record<string, unknown>[]> {
  if (!SSE_URL) {
    throw new Error("NEXT_PUBLIC_SSE_URL is not configured.");
  }

  const idToken = await getIdToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  const res = await fetch(SSE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ question, autoApproveActions: true }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let tableRows: Record<string, unknown>[] | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n");

    const splitIndex = buffer.lastIndexOf("\n\n");
    if (splitIndex === -1) continue;

    const chunk = buffer.slice(0, splitIndex + 2);
    buffer = buffer.slice(splitIndex + 2);

    const extracted = extractRowsFromFrames(parseSseChunk(chunk));
    if (extracted) {
      tableRows = extracted;
      break;
    }
  }

  if (!tableRows && buffer.trim().length > 0) {
    const extracted = extractRowsFromFrames(parseSseChunk(buffer));
    if (extracted) {
      tableRows = extracted;
    }
  }

  return tableRows ?? [];
}

export function useDashboardData(): DashboardData {
  const [data, setData] = useState<DashboardData>(INITIAL_DATA);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const errors: string[] = [];

      let sessionRows: Record<string, unknown>[] = [];
      let installRows: Record<string, unknown>[] = [];
      let engagementRows: Record<string, unknown>[] = [];

      try {
        sessionRows = await runSseQuery("24년 11월 채널별 총 세션수를 보여줘");
      } catch (err) {
        errors.push(`세션: ${(err as Error).message}`);
      }

      try {
        installRows = await runSseQuery("24년 11월 미디어소스별 총 설치건수를 보여줘");
      } catch (err) {
        errors.push(`설치: ${(err as Error).message}`);
      }

      try {
        engagementRows = await runSseQuery("24년 11월 채널별 engagement_rate를 보여줘");
      } catch (err) {
        errors.push(`참여율: ${(err as Error).message}`);
      }

      const sessionsByChannel = new Map<string, number>();
      const installsBySource = new Map<string, number>();
      const trendMap = new Map<string, { sessions: number; installs: number }>();

      for (const row of sessionRows) {
        const channel = String(row.channel_group ?? row.channel ?? "기타");
        const sessions = parseNumber(row.sessions);
        sessionsByChannel.set(channel, (sessionsByChannel.get(channel) ?? 0) + sessions);

        const dt = normalizeDateLabel(row.dt);
        if (dt) {
          const curr = trendMap.get(dt) ?? { sessions: 0, installs: 0 };
          curr.sessions += sessions;
          trendMap.set(dt, curr);
        }
      }

      for (const row of installRows) {
        const source = String(row.media_source ?? row.source ?? "기타");
        const installs = parseNumber(row.installs);
        installsBySource.set(source, (installsBySource.get(source) ?? 0) + installs);

        const dt = normalizeDateLabel(row.dt);
        if (dt) {
          const curr = trendMap.get(dt) ?? { sessions: 0, installs: 0 };
          curr.installs += installs;
          trendMap.set(dt, curr);
        }
      }

      const engagementValues: number[] = [];
      for (const row of engagementRows) {
        const raw = parseNumber(row.engagement_rate);
        if (raw <= 0) continue;
        engagementValues.push(raw > 1 ? raw / 100 : raw);
      }

      const totalSessions = Array.from(sessionsByChannel.values()).reduce((acc, n) => acc + n, 0);
      const totalInstalls = Array.from(installsBySource.values()).reduce((acc, n) => acc + n, 0);
      const avgEngagementRate =
        engagementValues.length > 0
          ? engagementValues.reduce((acc, n) => acc + n, 0) / engagementValues.length
          : 0;

      const channelShare = Array.from(sessionsByChannel.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, value]) => ({
          name,
          value: totalSessions > 0 ? Number(((value / totalSessions) * 100).toFixed(1)) : 0,
        }));

      const trend = Array.from(trendMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-7)
        .map(([date, value]) => ({
          date,
          sessions: Math.round(value.sessions),
          installs: Math.round(value.installs),
        }));

      if (cancelled) return;

      setData({
        totalSessions: Math.round(totalSessions),
        totalInstalls: Math.round(totalInstalls),
        avgEngagementRate,
        channelShare,
        trend,
        loading: false,
        error: errors.length > 0 ? errors.join(" | ") : null,
      });
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => data, [data]);
}
