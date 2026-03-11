"use client";

import type { DashboardCacheData } from "@/hooks/useDashboardCache";
import ExportMenuButton from "@/components/dashboard/ExportMenuButton";
import type { WeekRange } from "@/components/dashboard/WeekSelector";
import { downloadDashboardCsv } from "@/lib/dashboardCsv";
import { downloadDashboardExcel } from "@/lib/dashboardExcel";

interface ExportExcelButtonProps {
  selectedRange: WeekRange;
  data: DashboardCacheData;
}

export default function ExportExcelButton({
  selectedRange,
  data,
}: ExportExcelButtonProps) {
  const handleExportExcel = () => {
    downloadDashboardExcel(
      {
        selectedRange,
        generatedAt: new Date().toISOString(),
        data,
      },
      `dashboard-${selectedRange.start}_${selectedRange.end}.xlsx`
    );
  };

  const handleExportCsv = () => {
    downloadDashboardCsv({
      selectedRange,
      data,
    });
  };

  return (
    <ExportMenuButton
      size="sm"
      variant="outline"
      disabled={data.loading}
      onExportExcel={handleExportExcel}
      onExportCsv={handleExportCsv}
    />
  );
}
