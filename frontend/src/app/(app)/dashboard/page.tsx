"use client";

import { useEffect, useState, type ReactNode } from "react";
import CampaignInstallsChart from "@/components/dashboard/CampaignInstallsChart";
import CardActionMenu from "@/components/dashboard/CardActionMenu";
import ChannelPieChart from "@/components/dashboard/ChannelPieChart";
import ChannelRevenueChart from "@/components/dashboard/ChannelRevenueChart";
import ConversionChart from "@/components/dashboard/ConversionChart";
import ExportExcelButton from "@/components/dashboard/ExportExcelButton";
import InstallFunnelChart from "@/components/dashboard/InstallFunnelChart";
import KpiCard, { type DashboardKpi } from "@/components/dashboard/KpiCard";
import PdfExportButton from "@/components/dashboard/PdfExportButton";
import RetentionCohortChart from "@/components/dashboard/RetentionCohortChart";
import ShareButton from "@/components/dashboard/ShareButton";
import TrendLineChart from "@/components/dashboard/TrendLineChart";
import WeekSelector, { type WeekRange } from "@/components/dashboard/WeekSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardCache } from "@/hooks/useDashboardCache";
import {
  buildDashboardCardExports,
  type DashboardCardExportConfig,
} from "@/lib/dashboardCardExports";
import { formatWeekRangeLabel } from "@/lib/weekRangeLabel";

function formatInt(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.max(0, Math.round(value)));
}

function formatRate(value: number): string {
  return `${(Math.max(0, value) * 100).toFixed(1)}%`;
}

export default function DashboardPage() {
  const [weeks, setWeeks] = useState<WeekRange[]>([]);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);

  useEffect(() => {
    fetch("/dashboard-cache/manifest.json")
      .then((response) => response.json() as Promise<WeekRange[]>)
      .then((data) => {
        setWeeks(data);
        setSelectedWeekIndex(Math.max(0, data.length - 2));
      });
  }, []);

  const selectedRange = weeks[selectedWeekIndex] ?? { start: "", end: "", label: "" };
  const dashboardData = useDashboardCache(selectedRange);
  const {
    totalSessions,
    totalInstalls,
    avgEngagementRate,
    kpiComparison,
    channelShare,
    conversionByChannel,
    channelRevenue,
    campaignInstalls,
    installFunnel,
    retention,
    trend,
    loading,
    error,
  } = dashboardData;
  const cardExports = buildDashboardCardExports(dashboardData);

  const renderCardAction = (config: DashboardCardExportConfig) => (
    <CardActionMenu
      title={config.title}
      selectedRange={selectedRange}
      unit={config.unit}
      columns={config.columns}
      rows={config.rows}
      disabled={loading || !selectedRange.start}
    />
  );

  const kpis: Array<{ kpi: DashboardKpi; actionSlot: ReactNode }> = [
    {
      kpi: {
        label: cardExports.totalSessions.title,
        value: totalSessions !== null ? formatInt(totalSessions) : "Data unavailable",
        currentValue: kpiComparison.totalSessions.currentValue,
        previousValue: kpiComparison.totalSessions.previousValue,
        deltaPercent: kpiComparison.totalSessions.deltaPercent,
      },
      actionSlot: renderCardAction(cardExports.totalSessions),
    },
    {
      kpi: {
        label: cardExports.totalInstalls.title,
        value: totalInstalls !== null ? formatInt(totalInstalls) : "Data unavailable",
        currentValue: kpiComparison.totalInstalls.currentValue,
        previousValue: kpiComparison.totalInstalls.previousValue,
        deltaPercent: kpiComparison.totalInstalls.deltaPercent,
      },
      actionSlot: renderCardAction(cardExports.totalInstalls),
    },
    {
      kpi: {
        label: cardExports.avgEngagementRate.title,
        value: avgEngagementRate !== null ? formatRate(avgEngagementRate) : "Data unavailable",
        currentValue: kpiComparison.avgEngagementRate.currentValue,
        previousValue: kpiComparison.avgEngagementRate.previousValue,
        deltaPercent: kpiComparison.avgEngagementRate.deltaPercent,
      },
      actionSlot: renderCardAction(cardExports.avgEngagementRate),
    },
  ];

  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-6 py-8">
      <div id="dashboard-content" className="mx-auto w-full max-w-6xl space-y-6">
        <div className="nhn-panel space-y-2 px-6 py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-bold tracking-tight">Marketing Dashboard</h1>
            <div className="flex items-center gap-2">
              {weeks.length > 0 && (
                <WeekSelector
                  weeks={weeks}
                  selectedIndex={selectedWeekIndex}
                  onChange={(index) => {
                    setSelectedWeekIndex(Math.min(Math.max(index, 0), weeks.length - 1));
                  }}
                />
              )}
              {selectedRange.start && (
                <>
                  <ShareButton selectedRange={selectedRange} />
                  <ExportExcelButton selectedRange={selectedRange} data={dashboardData} />
                  <PdfExportButton
                    targetId="dashboard-content"
                    filename={`dashboard-${selectedRange.start}_${selectedRange.end}.pdf`}
                  />
                </>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatWeekRangeLabel(selectedRange)} summary
          </p>
          {error && <p className="mt-2 text-xs text-destructive">Dashboard data load failed: {error}</p>}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {loading
            ? Array.from({ length: 3 }).map((_, idx) => (
                <Card key={idx} className="nhn-panel py-4">
                  <CardContent className="space-y-3">
                    <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                    <div className="h-8 w-40 animate-pulse rounded bg-muted" />
                  </CardContent>
                </Card>
              ))
            : kpis.map(({ kpi, actionSlot }) => (
                <KpiCard key={kpi.label} kpi={kpi} actionSlot={actionSlot} />
              ))}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card className="nhn-panel">
            <CardHeader>
              <CardTitle className="text-sm font-semibold tracking-wide">
                {cardExports.channelShare.title}
              </CardTitle>
              {renderCardAction(cardExports.channelShare)}
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-[260px] animate-pulse rounded-lg bg-muted" />
              ) : channelShare.length > 0 ? (
                <ChannelPieChart data={channelShare} totalValue={totalSessions} />
              ) : (
                <p className="text-sm text-muted-foreground">Data unavailable</p>
              )}
            </CardContent>
          </Card>

          <Card className="nhn-panel">
            <CardHeader>
              <CardTitle className="text-sm font-semibold tracking-wide">
                {cardExports.trend.title}
              </CardTitle>
              {renderCardAction(cardExports.trend)}
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-[240px] animate-pulse rounded-lg bg-muted" />
              ) : trend.length > 0 ? (
                <TrendLineChart data={trend} />
              ) : (
                <p className="text-sm text-muted-foreground">Data unavailable</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ChannelRevenueChart
            data={channelRevenue}
            loading={loading}
            title={cardExports.channelRevenue.title}
            actionSlot={renderCardAction(cardExports.channelRevenue)}
          />
          <ConversionChart
            data={conversionByChannel}
            loading={loading}
            title={cardExports.conversionByChannel.title}
            actionSlot={renderCardAction(cardExports.conversionByChannel)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CampaignInstallsChart
            data={campaignInstalls}
            loading={loading}
            title={cardExports.campaignInstalls.title}
            actionSlot={renderCardAction(cardExports.campaignInstalls)}
          />
          <InstallFunnelChart
            data={installFunnel}
            loading={loading}
            title={cardExports.installFunnel.title}
            actionSlot={renderCardAction(cardExports.installFunnel)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4">
          <RetentionCohortChart
            data={retention}
            loading={loading}
            title={cardExports.retention.title}
            actionSlot={renderCardAction(cardExports.retention)}
          />
        </div>
      </div>
    </div>
  );
}
