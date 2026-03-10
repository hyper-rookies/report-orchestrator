"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DashboardCardExportConfig, ExcelColumn } from "@/lib/dashboardCardExports";

function formatCellValue(
  config: DashboardCardExportConfig,
  column: ExcelColumn,
  value: string | number | null | undefined
): string {
  if (value == null || value === "") {
    return "-";
  }

  if (typeof value === "number") {
    if (column.key === "day") {
      return `D${value}`;
    }

    if (column.key.toLowerCase().includes("percent") || column.header.includes("%")) {
      return `${value.toFixed(2)}%`;
    }

    if (config.unit === "%" && Number.isFinite(value)) {
      return `${value.toFixed(2)}%`;
    }

    return Number.isInteger(value)
      ? value.toLocaleString("ko-KR")
      : value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
  }

  return String(value);
}

export default function DashboardCardTable({ config }: { config: DashboardCardExportConfig }) {
  return (
    <div className="max-h-[320px] overflow-auto rounded-xl border border-border/80 bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            {config.columns.map((column) => (
              <TableHead
                key={column.key}
                className={column.key.toLowerCase().includes("percent") ? "text-right" : undefined}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {config.rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={config.columns.length}
                className="py-8 text-center text-muted-foreground"
              >
                No data available.
              </TableCell>
            </TableRow>
          ) : (
            config.rows.map((row, index) => (
              <TableRow key={`${config.title}-${index}`}>
                {config.columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className={
                      column.key === "day" ||
                      column.key.toLowerCase().includes("percent") ||
                      typeof row[column.key] === "number"
                        ? "text-right"
                        : undefined
                    }
                  >
                    {formatCellValue(config, column, row[column.key])}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
