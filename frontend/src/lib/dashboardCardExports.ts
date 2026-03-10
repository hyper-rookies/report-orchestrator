import type { DashboardCacheData } from "@/hooks/useDashboardCache";

export interface ExcelColumn {
  key: string;
  header: string;
}

export interface DashboardCardExportConfig {
  title: string;
  unit: string;
  columns: ExcelColumn[];
  rows: Array<Record<string, string | number | null>>;
}

export interface DashboardCardExportMap {
  totalSessions: DashboardCardExportConfig;
  totalInstalls: DashboardCardExportConfig;
  avgEngagementRate: DashboardCardExportConfig;
  channelShare: DashboardCardExportConfig;
  trend: DashboardCardExportConfig;
  channelRevenue: DashboardCardExportConfig;
  conversionByChannel: DashboardCardExportConfig;
  campaignInstalls: DashboardCardExportConfig;
  installFunnel: DashboardCardExportConfig;
  retention: DashboardCardExportConfig;
}

function roundPercent(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  return Number((value * 100).toFixed(2));
}

function roundDelta(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(2));
}

export function buildDashboardCardExports(data: DashboardCacheData): DashboardCardExportMap {
  return {
    totalSessions: {
      title: "Total Sessions",
      unit: "sessions",
      columns: [
        { key: "currentValue", header: "Current Value" },
        { key: "previousValue", header: "Previous Week Value" },
        { key: "deltaPercent", header: "Delta (%)" },
      ],
      rows: [
        {
          currentValue: data.totalSessions,
          previousValue: data.kpiComparison.totalSessions.previousValue,
          deltaPercent: roundDelta(data.kpiComparison.totalSessions.deltaPercent),
        },
      ],
    },
    totalInstalls: {
      title: "Total Installs",
      unit: "installs",
      columns: [
        { key: "currentValue", header: "Current Value" },
        { key: "previousValue", header: "Previous Week Value" },
        { key: "deltaPercent", header: "Delta (%)" },
      ],
      rows: [
        {
          currentValue: data.totalInstalls,
          previousValue: data.kpiComparison.totalInstalls.previousValue,
          deltaPercent: roundDelta(data.kpiComparison.totalInstalls.deltaPercent),
        },
      ],
    },
    avgEngagementRate: {
      title: "Avg Engagement Rate",
      unit: "%",
      columns: [
        { key: "currentValue", header: "Current Value (%)" },
        { key: "previousValue", header: "Previous Week Value (%)" },
        { key: "deltaPercent", header: "Delta (%)" },
      ],
      rows: [
        {
          currentValue: roundPercent(data.avgEngagementRate),
          previousValue: roundPercent(data.kpiComparison.avgEngagementRate.previousValue),
          deltaPercent: roundDelta(data.kpiComparison.avgEngagementRate.deltaPercent),
        },
      ],
    },
    channelShare: {
      title: "Session Share by Channel",
      unit: "%",
      columns: [
        { key: "channel", header: "Channel" },
        { key: "sessions", header: "Sessions" },
        { key: "sharePercent", header: "Share (%)" },
      ],
      rows: data.channelShare.map((item) => ({
        channel: item.name,
        sessions: item.sessions,
        sharePercent: item.value,
      })),
    },
    trend: {
      title: "7-Day Trend",
      unit: "sessions / installs",
      columns: [
        { key: "date", header: "Date" },
        { key: "sessions", header: "Sessions" },
        { key: "installs", header: "Installs" },
      ],
      rows: data.trend.map((item) => ({
        date: item.date,
        sessions: item.sessions,
        installs: item.installs,
      })),
    },
    channelRevenue: {
      title: "Revenue by Channel",
      unit: "KRW",
      columns: [
        { key: "channel", header: "Channel" },
        { key: "revenue", header: "Revenue" },
      ],
      rows: data.channelRevenue.map((item) => ({
        channel: item.channel,
        revenue: item.revenue,
      })),
    },
    conversionByChannel: {
      title: "Conversion by Channel",
      unit: "%",
      columns: [
        { key: "channel", header: "Channel" },
        { key: "conversionRatePercent", header: "Conversion Rate (%)" },
      ],
      rows: data.conversionByChannel.map((item) => ({
        channel: item.channel,
        conversionRatePercent: roundPercent(item.conversionRate),
      })),
    },
    campaignInstalls: {
      title: "Campaign Installs Top 10",
      unit: "installs",
      columns: [
        { key: "rank", header: "Rank" },
        { key: "campaign", header: "Campaign" },
        { key: "installs", header: "Installs" },
      ],
      rows: data.campaignInstalls.slice(0, 10).map((item, index) => ({
        rank: index + 1,
        campaign: item.campaign,
        installs: item.installs,
      })),
    },
    installFunnel: {
      title: "Install Funnel",
      unit: "events",
      columns: [
        { key: "stage", header: "Stage" },
        { key: "count", header: "Event Count" },
      ],
      rows: data.installFunnel.map((item) => ({
        stage: item.stage,
        count: item.count,
      })),
    },
    retention: {
      title: "Retention Cohort (Day N)",
      unit: "%",
      columns: [
        { key: "day", header: "Day" },
        { key: "retentionRatePercent", header: "Retention (%)" },
      ],
      rows: data.retention.map((item) => ({
        day: item.day,
        retentionRatePercent: roundPercent(item.retentionRate),
      })),
    },
  };
}
