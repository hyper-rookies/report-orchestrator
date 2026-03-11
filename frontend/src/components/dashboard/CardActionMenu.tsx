"use client";

import ExportMenuButton from "@/components/dashboard/ExportMenuButton";
import type { WeekRange } from "@/components/dashboard/WeekSelector";
import { CardAction } from "@/components/ui/card";
import type { ExcelColumn } from "@/lib/dashboardCardExports";
import { downloadDashboardCardCsv } from "@/lib/dashboardCsv";
import { downloadDashboardCardExcel, type ExcelRow } from "@/lib/dashboardExcel";

interface CardActionMenuProps {
  title: string;
  selectedRange: WeekRange;
  unit: string;
  columns: ExcelColumn[];
  rows: ExcelRow[];
  disabled?: boolean;
}

export default function CardActionMenu({
  title,
  selectedRange,
  unit,
  columns,
  rows,
  disabled = false,
}: CardActionMenuProps) {
  const handleExportExcel = () => {
    downloadDashboardCardExcel({
      title,
      selectedRange,
      generatedAt: new Date().toISOString(),
      unit,
      columns,
      rows,
      sheetName: title.slice(0, 31),
    });
  };

  const handleExportCsv = () => {
    downloadDashboardCardCsv({
      title,
      selectedRange,
      columns,
      rows,
    });
  };

  return (
    <CardAction
      className="relative"
      data-pdf-export-hide="true"
      data-html2canvas-ignore="true"
    >
      <div className="inline-flex items-center rounded-md border border-input/80 bg-background p-0.5 shadow-xs">
        <ExportMenuButton
          variant="ghost"
          size="xs"
          disabled={disabled || rows.length === 0}
          onExportExcel={handleExportExcel}
          onExportCsv={handleExportCsv}
        />
      </div>
    </CardAction>
  );
}
