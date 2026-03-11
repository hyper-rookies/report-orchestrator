"use client";

import { useState, type ReactNode } from "react";
import { BarChart3, Table2 } from "lucide-react";
import DashboardCardTable from "@/components/dashboard/DashboardCardTable";
import ExportMenuButton from "@/components/dashboard/ExportMenuButton";
import type { WeekRange } from "@/components/dashboard/WeekSelector";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardCardExportConfig } from "@/lib/dashboardCardExports";
import { downloadDashboardCardCsv } from "@/lib/dashboardCsv";
import { downloadDashboardCardExcel } from "@/lib/dashboardExcel";

interface DashboardCardViewProps {
  title: string;
  selectedRange: WeekRange;
  exportConfig: DashboardCardExportConfig;
  chart: ReactNode;
  loading?: boolean;
  skeletonClassName?: string;
}

export default function DashboardCardView({
  title,
  selectedRange,
  exportConfig,
  chart,
  loading = false,
  skeletonClassName = "h-[240px] animate-pulse rounded-lg bg-muted",
}: DashboardCardViewProps) {
  const [view, setView] = useState<"chart" | "table">("chart");

  const handleExportExcel = () => {
    downloadDashboardCardExcel({
      title: exportConfig.title,
      selectedRange,
      generatedAt: new Date().toISOString(),
      unit: exportConfig.unit,
      columns: exportConfig.columns,
      rows: exportConfig.rows,
      sheetName: exportConfig.title.slice(0, 31),
    });
  };

  const handleExportCsv = () => {
    downloadDashboardCardCsv({
      title: exportConfig.title,
      selectedRange,
      columns: exportConfig.columns,
      rows: exportConfig.rows,
    });
  };

  return (
    <Card className="nhn-panel">
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <CardAction
          className="flex items-center gap-2"
          data-pdf-export-hide="true"
          data-html2canvas-ignore="true"
        >
          <div className="inline-flex items-center rounded-md border border-input/80 bg-background p-0.5 shadow-xs">
            <Button
              type="button"
              variant={view === "chart" ? "secondary" : "ghost"}
              size="xs"
              className="rounded-sm"
              disabled={loading}
              onClick={() => setView("chart")}
              aria-pressed={view === "chart"}
            >
              <BarChart3 className="h-3 w-3" />
              Chart
            </Button>
            <Button
              type="button"
              variant={view === "table" ? "secondary" : "ghost"}
              size="xs"
              className="rounded-sm"
              disabled={loading}
              onClick={() => setView("table")}
              aria-pressed={view === "table"}
            >
              <Table2 className="h-3 w-3" />
              Table
            </Button>
          </div>
          <div className="inline-flex items-center rounded-md border border-input/80 bg-background p-0.5 shadow-xs">
            <ExportMenuButton
              variant="ghost"
              size="xs"
              disabled={loading || exportConfig.rows.length === 0}
              onExportExcel={handleExportExcel}
              onExportCsv={handleExportCsv}
            />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className={skeletonClassName} />
        ) : view === "chart" ? (
          chart
        ) : (
          <DashboardCardTable config={exportConfig} />
        )}
      </CardContent>
    </Card>
  );
}
