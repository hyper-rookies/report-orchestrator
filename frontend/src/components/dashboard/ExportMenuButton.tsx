"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileSpreadsheet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ExportMenuButtonProps {
  disabled?: boolean;
  onExportExcel: () => void | Promise<void>;
  onExportCsv: () => void | Promise<void>;
  size?: "xs" | "sm";
  variant?: "ghost" | "outline";
  className?: string;
}

export default function ExportMenuButton({
  disabled = false,
  onExportExcel,
  onExportCsv,
  size = "sm",
  variant = "outline",
  className,
}: ExportMenuButtonProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const actionDisabled = disabled || exporting;

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

  const runExport = async (fn: () => void | Promise<void>) => {
    if (actionDisabled) {
      return;
    }

    setExporting(true);
    setOpen(false);
    try {
      await fn();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div ref={menuRef} className={cn("relative", className)}>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={actionDisabled}
        onClick={() => setOpen((current) => !current)}
        className={cn("gap-1.5", size === "xs" && "rounded-sm")}
      >
        <Download className={size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5"} />
        Export
        <ChevronDown className={size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-40 rounded-lg border bg-card p-1 shadow-lg">
          <button
            type="button"
            disabled={actionDisabled}
            onClick={() => void runExport(onExportExcel)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
              actionDisabled
                ? "cursor-not-allowed text-muted-foreground/60"
                : "hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Excel workbook
          </button>
          <button
            type="button"
            disabled={actionDisabled}
            onClick={() => void runExport(onExportCsv)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
              actionDisabled
                ? "cursor-not-allowed text-muted-foreground/60"
                : "hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
        </div>
      )}
    </div>
  );
}
