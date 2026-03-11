"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";

interface DashboardData {
  totalSessions: number | null;
  totalInstalls: number | null;
  avgEngagementRate: number | null;
  channelShare: Array<{ name: string; value: number }>;
  trend: Array<{ date: string; sessions: number; installs: number }>;
  loading: boolean;
  error: string | null;
  debug: DashboardDebug;
}

interface SseFrame {
  type: string;
  data: Record<string, unknown>;
}

type DashboardQueryKey =
  | "sessions"
  | "installs"
  | "engagement"
  | "trend_sessions"
  | "trend_installs";

interface DashboardQueryDebug {
  key: DashboardQueryKey;
  question: string;
  status: "pending" | "ok" | "error";
  reportId: string | null;
  error: string | null;
  rowCount: number;
  lastEvent: string | null;
}

interface DashboardDebug {
  generatedAt: string | null;
  queries: DashboardQueryDebug[];
}

const SSE_URL = process.env.NEXT_PUBLIC_SSE_URL ?? "";
const USE_MOCK_AUTH = process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true";

const INITIAL_DATA: DashboardData = {
  totalSessions: null,
  totalInstalls: null,
  avgEngagementRate: null,
  channelShare: [],
  trend: [],
  loading: true,
  error: null,
  debug: {
    generatedAt: null,
    queries: [],
  },
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
  const [, month, day] = value.split("-");
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

interface QueryExecutionResult {
  rows: Record<string, unknown>[];
  debug: Omit<DashboardQueryDebug, "key" | "question">;
}

async function runSseQuery(question: string, timeoutMs = 45000): Promise<QueryExecutionResult> {
  const debug: Omit<DashboardQueryDebug, "key" | "question"> = {
    status: "pending",
    reportId: null,
    error: null,
    rowCount: 0,
    lastEvent: null,
  };
  if (!SSE_URL) {
    debug.status = "error";
    debug.error = "NEXT_PUBLIC_SSE_URL is not configured.";
    return { rows: [], debug };
  }

  const idToken = await getIdToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
        res = await fetch(SSE_URL, {
          method: "POST",
          headers,
          body: JSON.stringify({ question }),
          signal: controller.signal,
        });
  } catch (err) {
    debug.status = "error";
    debug.error =
      (err as Error).name === "AbortError"
        ? `Timeout after ${Math.floor(timeoutMs / 1000)}s`
        : (err as Error).message;
    clearTimeout(timeoutId);
    return { rows: [], debug };
  }

  if (!res.ok || !res.body) {
    debug.status = "error";
    debug.error = `HTTP ${res.status}`;
    return { rows: [], debug };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let tableRows: Record<string, unknown>[] | null = null;

  const processFrames = (frames: SseFrame[]): { shouldStop: boolean } => {
    for (const frame of frames) {
      debug.lastEvent = frame.type;
      if (frame.type === "meta") {
        const reportId = frame.data.reportId;
        if (typeof reportId === "string" && reportId.trim().length > 0) {
          debug.reportId = reportId;
        }
      }
      if (frame.type === "table") {
        const rows = frame.data.rows;
        if (Array.isArray(rows)) {
          tableRows = rows as Record<string, unknown>[];
          debug.rowCount = tableRows.length;
        }
      }
      if (frame.type === "error") {
        debug.status = "error";
        debug.error = (frame.data.message as string) ?? "SSE query failed.";
        return { shouldStop: true };
      }
      if (frame.type === "final") {
        return { shouldStop: true };
      }
    }
    return { shouldStop: false };
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");

      const splitIndex = buffer.lastIndexOf("\n\n");
      if (splitIndex === -1) continue;

      const chunk = buffer.slice(0, splitIndex + 2);
      buffer = buffer.slice(splitIndex + 2);

      const { shouldStop } = processFrames(parseSseChunk(chunk));
      if (shouldStop) {
        break;
      }
    }
  } catch (err) {
    debug.status = "error";
    debug.error =
      (err as Error).name === "AbortError"
        ? `Timeout after ${Math.floor(timeoutMs / 1000)}s`
        : (err as Error).message;
  } finally {
    clearTimeout(timeoutId);
  }

  if (buffer.trim().length > 0) {
    processFrames(parseSseChunk(buffer));
  }

  if (debug.status === "pending") {
    debug.status = "ok";
  }

  if (!tableRows && debug.status === "ok") {
    debug.status = "error";
    debug.error = "No table data returned.";
  }

  return { rows: tableRows ?? [], debug };
}

export function useDashboardData(): DashboardData {
  const [data, setData] = useState<DashboardData>(INITIAL_DATA);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      let sessionError: string | null = null;
      let installError: string | null = null;
      let engagementError: string | null = null;
      const debugQueries: DashboardQueryDebug[] = [];
      let sessionRows: Record<string, unknown>[] = [];
      let installRows: Record<string, unknown>[] = [];
      let engagementRows: Record<string, unknown>[] = [];
      let trendSessionRows: Record<string, unknown>[] = [];
      let trendInstallRows: Record<string, unknown>[] = [];

      const sessionQuestion = "24년 11월 채널별 총 세션수를 보여줘";
      const installQuestion = "24년 11월 미디어소스별 총 설치건수를 보여줘";
      const engagementQuestion = "24년 11월 채널별 engagement_rate를 보여줘";
      const trendSessionsQuestion =
        "24년 11월 v_latest_ga4_acquisition_daily에서 dt 일자별 sessions 합계를 보여줘";
      const trendInstallsQuestion =
        "24년 11월 v_latest_appsflyer_installs_daily에서 dt 일자별 installs 합계를 보여줘";
      const baseDebugQueries: DashboardQueryDebug[] = [
        {
          key: "sessions",
          question: sessionQuestion,
          status: "pending",
          reportId: null,
          error: null,
          rowCount: 0,
          lastEvent: null,
        },
        {
          key: "installs",
          question: installQuestion,
          status: "pending",
          reportId: null,
          error: null,
          rowCount: 0,
          lastEvent: null,
        },
        {
          key: "engagement",
          question: engagementQuestion,
          status: "pending",
          reportId: null,
          error: null,
          rowCount: 0,
          lastEvent: null,
        },
        {
          key: "trend_sessions",
          question: trendSessionsQuestion,
          status: "pending",
          reportId: null,
          error: null,
          rowCount: 0,
          lastEvent: null,
        },
        {
          key: "trend_installs",
          question: trendInstallsQuestion,
          status: "pending",
          reportId: null,
          error: null,
          rowCount: 0,
          lastEvent: null,
        },
      ];
      if (!cancelled) {
        setData((prev) => ({
          ...prev,
          loading: true,
          debug: {
            generatedAt: new Date().toISOString(),
            queries: baseDebugQueries,
          },
        }));
      }

      const pushQueryDebug = (item: DashboardQueryDebug) => {
        const idx = debugQueries.findIndex((q) => q.key === item.key);
        if (idx === -1) {
          debugQueries.push(item);
        } else {
          debugQueries[idx] = item;
        }
      };

      try {
        const result = await runSseQuery(sessionQuestion);
        sessionRows = result.rows;
        pushQueryDebug({ key: "sessions", question: sessionQuestion, ...result.debug });
        if (result.debug.status === "error") {
          sessionError = result.debug.error ?? "Unknown error";
        }
      } catch (err) {
        sessionError = (err as Error).message;
        pushQueryDebug({
          key: "sessions",
          question: sessionQuestion,
          status: "error",
          reportId: null,
          error: sessionError,
          rowCount: 0,
          lastEvent: null,
        });
      }

      try {
        const result = await runSseQuery(installQuestion);
        installRows = result.rows;
        pushQueryDebug({ key: "installs", question: installQuestion, ...result.debug });
        if (result.debug.status === "error") {
          installError = result.debug.error ?? "Unknown error";
        }
      } catch (err) {
        installError = (err as Error).message;
        pushQueryDebug({
          key: "installs",
          question: installQuestion,
          status: "error",
          reportId: null,
          error: installError,
          rowCount: 0,
          lastEvent: null,
        });
      }

      try {
        const result = await runSseQuery(engagementQuestion);
        engagementRows = result.rows;
        pushQueryDebug({ key: "engagement", question: engagementQuestion, ...result.debug });
        if (result.debug.status === "error") {
          engagementError = result.debug.error ?? "Unknown error";
        }
      } catch (err) {
        engagementError = (err as Error).message;
        pushQueryDebug({
          key: "engagement",
          question: engagementQuestion,
          status: "error",
          reportId: null,
          error: engagementError,
          rowCount: 0,
          lastEvent: null,
        });
      }

      try {
        const result = await runSseQuery(trendSessionsQuestion);
        trendSessionRows = result.rows;
        pushQueryDebug({
          key: "trend_sessions",
          question: trendSessionsQuestion,
          ...result.debug,
        });
      } catch {
        pushQueryDebug({
          key: "trend_sessions",
          question: trendSessionsQuestion,
          status: "error",
          reportId: null,
          error: "Trend sessions query failed before SSE parsing.",
          rowCount: 0,
          lastEvent: null,
        });
      }

      try {
        const result = await runSseQuery(trendInstallsQuestion);
        trendInstallRows = result.rows;
        pushQueryDebug({
          key: "trend_installs",
          question: trendInstallsQuestion,
          ...result.debug,
        });
      } catch {
        pushQueryDebug({
          key: "trend_installs",
          question: trendInstallsQuestion,
          status: "error",
          reportId: null,
          error: "Trend installs query failed before SSE parsing.",
          rowCount: 0,
          lastEvent: null,
        });
      }

      const sessionsByChannel = new Map<string, number>();
      const installsBySource = new Map<string, number>();
      const trendMap = new Map<string, { sessions: number; installs: number }>();

      for (const row of sessionRows) {
        const channel = String(row.channel_group ?? row.channel ?? "기타");
        const sessions = parseNumber(row.sessions);
        sessionsByChannel.set(channel, (sessionsByChannel.get(channel) ?? 0) + sessions);
      }

      for (const row of installRows) {
        const source = String(row.media_source ?? row.source ?? "기타");
        const installs = parseNumber(row.installs);
        installsBySource.set(source, (installsBySource.get(source) ?? 0) + installs);
      }

      for (const row of trendSessionRows) {
        const dt = normalizeDateLabel(row.dt);
        if (!dt) continue;
        const curr = trendMap.get(dt) ?? { sessions: 0, installs: 0 };
        curr.sessions += parseNumber(row.sessions);
        trendMap.set(dt, curr);
      }

      for (const row of trendInstallRows) {
        const dt = normalizeDateLabel(row.dt);
        if (!dt) continue;
        const curr = trendMap.get(dt) ?? { sessions: 0, installs: 0 };
        curr.installs += parseNumber(row.installs);
        trendMap.set(dt, curr);
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

      const errorParts = [
        sessionError && `세션: ${sessionError}`,
        installError && `설치: ${installError}`,
        engagementError && `참여율: ${engagementError}`,
      ].filter(Boolean);

      setData({
        totalSessions: sessionError ? null : Math.round(totalSessions),
        totalInstalls: installError ? null : Math.round(totalInstalls),
        avgEngagementRate: engagementError ? null : avgEngagementRate,
        channelShare,
        trend,
        loading: false,
        error: errorParts.length > 0 ? (errorParts as string[]).join(" | ") : null,
        debug: {
          generatedAt: new Date().toISOString(),
          queries: debugQueries,
        },
      });
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => data, [data]);
}
