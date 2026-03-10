"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import type { DashboardCacheData } from "@/hooks/useDashboardCache";
import type { WeekRange } from "@/components/dashboard/WeekSelector";
import { Button } from "@/components/ui/button";
import { downloadDashboardExcel } from "@/lib/dashboardExcel";

interface ExportExcelButtonProps {
  selectedRange: WeekRange;
  data: DashboardCacheData;
}

export default function ExportExcelButton({
  selectedRange,
  data,
}: ExportExcelButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);

    try {
      downloadDashboardExcel(
        {
          selectedRange,
          generatedAt: new Date().toISOString(),
          data,
        },
        `dashboard-${selectedRange.start}_${selectedRange.end}.xlsx`
      );
    } catch (error) {
      console.error("Excel export failed:", error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={exporting || data.loading}
      className="gap-1.5"
    >
      <Download className="h-3.5 w-3.5" />
      {exporting ? "Exporting..." : "Export Excel"}
    </Button>
  );
}
