"use client";

import { useEffect, useRef, useState } from "react";
import { Download, MoreHorizontal } from "lucide-react";
import type { WeekRange } from "@/components/dashboard/WeekSelector";
import { Button } from "@/components/ui/button";
import { CardAction } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  downloadDashboardCardExcel,
  type ExcelRow,
} from "@/lib/dashboardExcel";
import type { ExcelColumn } from "@/lib/dashboardCardExports";

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
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const exportDisabled = disabled || rows.length === 0 || exporting;

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const handleExport = async () => {
    if (exportDisabled) {
      return;
    }

    setExporting(true);
    setOpen(false);

    try {
      downloadDashboardCardExcel({
        title,
        selectedRange,
        generatedAt: new Date().toISOString(),
        unit,
        columns,
        rows,
      });
    } catch (error) {
      console.error(`Excel export failed for ${title}:`, error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <CardAction
      className="relative"
      data-pdf-export-hide="true"
      data-html2canvas-ignore="true"
    >
      <div ref={menuRef} className="relative">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-foreground"
          aria-label={`${title} 작업 메뉴`}
          onClick={(event) => {
            event.stopPropagation();
            setOpen((current) => !current);
          }}
          disabled={disabled}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>

        {open && (
          <div
            className="absolute right-0 top-7 z-20 min-w-36 rounded-lg border bg-card p-1 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                exportDisabled
                  ? "cursor-not-allowed text-muted-foreground/60"
                  : "hover:bg-accent hover:text-accent-foreground"
              )}
              onClick={() => void handleExport()}
              disabled={exportDisabled}
            >
              <Download className="h-3.5 w-3.5" />
              Excel 다운로드
            </button>
          </div>
        )}
      </div>
    </CardAction>
  );
}
