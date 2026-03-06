import { SseFrame } from "@/hooks/useSse";
import DataTable from "@/components/report/DataTable";
import ReportBarChart from "@/components/report/ReportBarChart";

import ProgressIndicator from "./ProgressIndicator";

interface Props {
  frames: SseFrame[];
  streaming?: boolean;
}

type ChartSpec = Parameters<typeof ReportBarChart>[0]["spec"];

export default function AssistantMessage({ frames, streaming }: Props) {
  const progressFrames = frames.filter((f) => f.type === "progress");
  const chunkFrames = frames.filter((f) => f.type === "chunk");
  const tableFrame = frames.find((f) => f.type === "table");
  const chartFrame = frames.find((f) => f.type === "chart");
  const errorFrame = frames.find((f) => f.type === "error");

  const streamingText = chunkFrames.map((f) => (f.data.text as string) ?? "").join("");
  const tableRows = ((tableFrame?.data.rows as Record<string, unknown>[] | undefined) ?? []).filter(
    (row) => typeof row === "object" && row !== null
  );

  const rawChartSpec = chartFrame?.data.spec as
    | {
        type?: string;
        title?: string;
        xAxis?: string;
        series?: Array<{ metric?: string }>;
        data?: Record<string, unknown>[];
      }
    | undefined;
  const firstSeriesMetric = rawChartSpec?.series?.[0]?.metric;
  const chartSpec: ChartSpec | null =
    typeof rawChartSpec?.xAxis === "string" && typeof firstSeriesMetric === "string"
      ? {
          xKey: rawChartSpec.xAxis,
          yKey: firstSeriesMetric,
          ...(typeof rawChartSpec.title === "string" ? { title: rawChartSpec.title } : {}),
        }
      : null;
  const chartRows = Array.isArray(rawChartSpec?.data)
    ? (rawChartSpec.data as Record<string, unknown>[])
    : tableRows;

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-3">
        {streaming && progressFrames.length > 0 && <ProgressIndicator frames={progressFrames} />}
        {streamingText && <p className="whitespace-pre-wrap text-sm">{streamingText}</p>}
        {tableFrame && <DataTable rows={tableRows} />}
        {chartFrame && chartSpec && chartRows.length > 0 && (
          <ReportBarChart rows={chartRows} spec={chartSpec} />
        )}
        {errorFrame && <p className="text-sm text-destructive">{errorFrame.data.message as string}</p>}
      </div>
    </div>
  );
}

