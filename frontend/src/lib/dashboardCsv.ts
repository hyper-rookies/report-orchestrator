import type { WeekRange } from "@/components/dashboard/WeekSelector";
import type { DashboardCacheData } from "@/hooks/useDashboardCache";
import {
  buildDashboardCardExports,
  type DashboardCardExportConfig,
  type ExcelColumn,
} from "@/lib/dashboardCardExports";

type CsvValue = string | number | boolean | null | undefined;
type CsvRow = Record<string, CsvValue>;

interface DashboardCardCsvInput {
  title: string;
  selectedRange: WeekRange;
  columns: ExcelColumn[];
  rows: CsvRow[];
}

interface DashboardCsvInput {
  selectedRange: WeekRange;
  data: DashboardCacheData;
}

function escapeCsv(value: CsvValue): string {
  if (value == null) {
    return "";
  }

  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function downloadCsvText(filename: string, lines: string[]): void {
  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function slugifyTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "export"
  );
}

function mapRows(columns: ExcelColumn[], rows: CsvRow[]): string[] {
  return rows.map((row) => columns.map((column) => escapeCsv(row[column.key])).join(","));
}

export function buildDashboardCardCsvFilename(title: string, selectedRange: WeekRange): string {
  return `${slugifyTitle(title)}-${selectedRange.start}_${selectedRange.end}.csv`;
}

export function downloadDashboardCardCsv(
  input: DashboardCardCsvInput,
  filename = buildDashboardCardCsvFilename(input.title, input.selectedRange)
): void {
  const lines = [
    input.columns.map((column) => escapeCsv(column.header)).join(","),
    ...mapRows(input.columns, input.rows),
  ];
  downloadCsvText(filename, lines);
}

export function buildDashboardCsvFilename(selectedRange: WeekRange): string {
  return `dashboard-${selectedRange.start}_${selectedRange.end}.csv`;
}

function buildSectionLines(config: DashboardCardExportConfig): string[] {
  const headerLine = config.columns.map((column) => escapeCsv(column.header)).join(",");
  const rowLines = mapRows(config.columns, config.rows);
  return [escapeCsv(config.title), headerLine, ...rowLines, ""];
}

export function downloadDashboardCsv(
  input: DashboardCsvInput,
  filename = buildDashboardCsvFilename(input.selectedRange)
): void {
  const cardExports = buildDashboardCardExports(input.data);
  const lines: string[] = [
    "Section",
    escapeCsv(`Dashboard Export (${input.selectedRange.start} to ${input.selectedRange.end})`),
    "",
  ];

  for (const config of Object.values(cardExports)) {
    lines.push(...buildSectionLines(config));
  }

  downloadCsvText(filename, lines);
}
