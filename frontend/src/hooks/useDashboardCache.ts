"use client";

import { useEffect, useState } from "react";
import type { WeekRange } from "@/components/dashboard/WeekSelector";

interface CacheRow {
  [key: string]: string | number | undefined;
}

interface DashboardCacheJson {
  week: WeekRange;
  generatedAt: string;
  sessions: CacheRow[];
  installs: CacheRow[];
  engagement: CacheRow[];
  trend_sessions: CacheRow[];
  trend_installs: CacheRow[];
  channel_revenue: CacheRow[];
  campaign_installs: CacheRow[];
  install_funnel: CacheRow[];
  retention: CacheRow[];
}

interface KpiComparisonMetric {
  currentValue: number | null;
  previousValue: number | null;
  deltaPercent: number | null;
}

interface ParsedDashboardCacheMetrics {
  totalSessions: number;
  totalInstalls: number;
  avgEngagementRate: number;
  channelShare: Array<{ name: string; value: number; sessions: number }>;
  trend: Array<{ date: string; sessions: number; installs: number }>;
  conversionByChannel: Array<{ channel: string; conversionRate: number }>;
  channelRevenue: Array<{ channel: string; revenue: number }>;
  campaignInstalls: Array<{ campaign: string; installs: number }>;
  installFunnel: Array<{ stage: string; count: number }>;
  retention: Array<{ day: number; retentionRate: number }>;
}

export interface DashboardCacheData {
  totalSessions: number | null;
  totalInstalls: number | null;
  avgEngagementRate: number | null;
  kpiComparison: {
    totalSessions: KpiComparisonMetric;
    totalInstalls: KpiComparisonMetric;
    avgEngagementRate: KpiComparisonMetric;
  };
  channelShare: Array<{ name: string; value: number; sessions: number }>;
  trend: Array<{ date: string; sessions: number; installs: number }>;
  conversionByChannel: Array<{ channel: string; conversionRate: number }>;
  channelRevenue: Array<{ channel: string; revenue: number }>;
  campaignInstalls: Array<{ campaign: string; installs: number }>;
  installFunnel: Array<{ stage: string; count: number }>;
  retention: Array<{ day: number; retentionRate: number }>;
  loading: boolean;
  error: string | null;
}

const EMPTY_KPI_COMPARISON = {
  totalSessions: { currentValue: null, previousValue: null, deltaPercent: null },
  totalInstalls: { currentValue: null, previousValue: null, deltaPercent: null },
  avgEngagementRate: { currentValue: null, previousValue: null, deltaPercent: null },
} satisfies DashboardCacheData["kpiComparison"];

const INITIAL: DashboardCacheData = {
  totalSessions: null,
  totalInstalls: null,
  avgEngagementRate: null,
  kpiComparison: EMPTY_KPI_COMPARISON,
  channelShare: [],
  trend: [],
  conversionByChannel: [],
  channelRevenue: [],
  campaignInstalls: [],
  installFunnel: [],
  retention: [],
  loading: true,
  error: null,
};

function parseNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").replace(/%/g, "").trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function normalizeDateLabel(dt: unknown): string | null {
  if (typeof dt !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dt)) return dt;
  const [, month, day] = dt.split("-");
  return `${month}/${day}`;
}

function calculateDeltaPercent(currentValue: number | null, previousValue: number | null): number | null {
  if (currentValue === null || previousValue === null || previousValue === 0) {
    return null;
  }

  return ((currentValue - previousValue) / previousValue) * 100;
}

function buildKpiComparison(
  currentValue: number | null,
  previousValue: number | null
): KpiComparisonMetric {
  return {
    currentValue,
    previousValue,
    deltaPercent: calculateDeltaPercent(currentValue, previousValue),
  };
}

function buildWeekUrl(range: WeekRange): string {
  return `/dashboard-cache/week=${range.start}_${range.end}.json`;
}

async function fetchCacheJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${url}`);
  }

  return (await res.json()) as T;
}

function findPreviousWeekRange(
  weeks: WeekRange[],
  selectedStart: string,
  selectedEnd: string
): WeekRange | null {
  const selectedIndex = weeks.findIndex(
    (week) => week.start === selectedStart && week.end === selectedEnd
  );

  if (selectedIndex <= 0) {
    return null;
  }

  return weeks[selectedIndex - 1] ?? null;
}

function parseCache(json: DashboardCacheJson): ParsedDashboardCacheMetrics {
  const sessionsByChannel = new Map<string, number>();
  for (const row of json.sessions) {
    const channel = String(row.channel_group ?? "기타");
    sessionsByChannel.set(channel, (sessionsByChannel.get(channel) ?? 0) + parseNum(row.sessions));
  }
  const totalSessions = Array.from(sessionsByChannel.values()).reduce((a, b) => a + b, 0);

  const channelShare = Array.from(sessionsByChannel.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({
      name,
      sessions: Math.round(value),
      value: totalSessions > 0 ? Number(((value / totalSessions) * 100).toFixed(1)) : 0,
    }));

  const conversionByChannel = json.sessions
    .map((row) => {
      const sessions = parseNum(row.sessions);
      if (row.conversions == null || sessions <= 0) return null;
      return {
        channel: String(row.channel_group ?? "Unknown"),
        conversionRate: parseNum(row.conversions) / sessions,
      };
    })
    .filter((x): x is { channel: string; conversionRate: number } => x !== null);

  const totalInstalls = json.installs.reduce((a, r) => a + parseNum(r.installs), 0);

  const engValues = json.engagement
    .map((r) => parseNum(r.engagement_rate))
    .filter((v) => v > 0)
    .map((v) => (v > 1 ? v / 100 : v));
  const avgEngagementRate =
    engValues.length > 0 ? engValues.reduce((a, b) => a + b, 0) / engValues.length : 0;

  const trendMap = new Map<string, { sessions: number; installs: number }>();
  for (const row of json.trend_sessions) {
    const dt = normalizeDateLabel(row.dt);
    if (!dt) continue;
    const curr = trendMap.get(dt) ?? { sessions: 0, installs: 0 };
    curr.sessions += parseNum(row.sessions);
    trendMap.set(dt, curr);
  }
  for (const row of json.trend_installs) {
    const dt = normalizeDateLabel(row.dt);
    if (!dt) continue;
    const curr = trendMap.get(dt) ?? { sessions: 0, installs: 0 };
    curr.installs += parseNum(row.installs);
    trendMap.set(dt, curr);
  }
  const trend = Array.from(trendMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-7)
    .map(([date, value]) => ({
      date,
      sessions: Math.round(value.sessions),
      installs: Math.round(value.installs),
    }));

  const channelRevenue = json.channel_revenue.map((row) => ({
    channel: String(row.channel_group ?? "Unknown"),
    revenue: parseNum(row.total_revenue),
  }));
  const campaignInstalls = json.campaign_installs
    .map((row) => ({
      campaign: String(row.campaign ?? "").trim(),
      installs: parseNum(row.installs),
    }))
    .filter((item) => item.campaign.length > 0 && item.installs > 0)
    .sort((a, b) => b.installs - a.installs);
  const installFunnel = json.install_funnel.map((row) => ({
    stage: String(row.event_name ?? "Unknown"),
    count: parseNum(row.event_count),
  }));
  const retention = json.retention
    .map((row) => {
      const cohortSize = parseNum(row.cohort_size);
      if (cohortSize <= 0) return null;
      return {
        day: parseNum(row.cohort_day),
        retentionRate: parseNum(row.retained_users) / cohortSize,
      };
    })
    .filter((value): value is { day: number; retentionRate: number } => value !== null)
    .sort((a, b) => a.day - b.day);

  return {
    totalSessions: Math.round(totalSessions),
    totalInstalls: Math.round(totalInstalls),
    avgEngagementRate,
    channelShare,
    trend,
    conversionByChannel,
    channelRevenue,
    campaignInstalls,
    installFunnel,
    retention,
  };
}

export function useDashboardCache(selectedRange: WeekRange): DashboardCacheData {
  const [data, setData] = useState<DashboardCacheData>(INITIAL);
  const { start, end } = selectedRange;

  useEffect(() => {
    let cancelled = false;

    if (!start || !end) {
      setData(INITIAL);
      return () => {
        cancelled = true;
      };
    }

    setData((prev) => ({
      ...prev,
      loading: true,
      error: null,
    }));

    const load = async () => {
      try {
        const [weeks, currentJson] = await Promise.all([
          fetchCacheJson<WeekRange[]>("/dashboard-cache/manifest.json"),
          fetchCacheJson<DashboardCacheJson>(buildWeekUrl({ start, end, label: "" })),
        ]);

        const currentMetrics = parseCache(currentJson);
        const previousRange = findPreviousWeekRange(weeks, start, end);
        let previousMetrics: ParsedDashboardCacheMetrics | null = null;

        if (previousRange) {
          try {
            const previousJson = await fetchCacheJson<DashboardCacheJson>(buildWeekUrl(previousRange));
            previousMetrics = parseCache(previousJson);
          } catch {
            previousMetrics = null;
          }
        }

        if (cancelled) {
          return;
        }

        setData({
          ...currentMetrics,
          kpiComparison: {
            totalSessions: buildKpiComparison(
              currentMetrics.totalSessions,
              previousMetrics?.totalSessions ?? null
            ),
            totalInstalls: buildKpiComparison(
              currentMetrics.totalInstalls,
              previousMetrics?.totalInstalls ?? null
            ),
            avgEngagementRate: buildKpiComparison(
              currentMetrics.avgEngagementRate,
              previousMetrics?.avgEngagementRate ?? null
            ),
          },
          loading: false,
          error: null,
        });
      } catch (err: unknown) {
        if (!cancelled) {
          setData((prev) => ({
            ...prev,
            loading: false,
            error: err instanceof Error ? err.message : "캐시 로드 실패",
          }));
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [start, end]);

  return data;
}
