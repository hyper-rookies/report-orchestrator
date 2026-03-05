import { SseFrame } from "@/hooks/useSse";

import DataTable from "./DataTable";
import ReportBarChart from "./ReportBarChart";

interface Props {
  frame: SseFrame;
}

export default function ReportRenderer({ frame }: Props) {
  const { summary, rows, chartSpec } = frame.data as {
    summary?: string;
    rows?: Record<string, unknown>[];
    chartSpec?: {
      type: string;
      xKey: string;
      yKey: string;
      title?: string;
    };
  };

  return (
    <div className="space-y-4">
      {summary && <p className="whitespace-pre-wrap text-sm">{summary}</p>}
      {rows && rows.length > 0 && <DataTable rows={rows} />}
      {chartSpec && rows && rows.length > 0 && <ReportBarChart rows={rows} spec={chartSpec} />}
    </div>
  );
}

