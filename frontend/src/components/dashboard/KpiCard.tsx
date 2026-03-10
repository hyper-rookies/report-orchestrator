import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface DashboardKpi {
  label: string;
  value: string;
  currentValue: number | null;
  previousValue: number | null;
  deltaPercent: number | null;
}

interface KpiCardProps {
  kpi: DashboardKpi;
  actionSlot?: ReactNode;
}

function formatDeltaText(deltaPercent: number): string {
  if (Object.is(deltaPercent, -0) || deltaPercent === 0) {
    return "0.0% 유지";
  }

  const prefix = deltaPercent > 0 ? "+" : "";
  const direction = deltaPercent > 0 ? "증가" : "감소";
  return `${prefix}${deltaPercent.toFixed(1)}% ${direction}`;
}

export default function KpiCard({ kpi, actionSlot }: KpiCardProps) {
  const hasComparison =
    kpi.currentValue !== null &&
    kpi.previousValue !== null &&
    kpi.deltaPercent !== null &&
    Number.isFinite(kpi.deltaPercent);
  const deltaPercent = hasComparison ? kpi.deltaPercent : null;

  return (
    <Card className="nhn-panel gap-3 py-4">
      <CardHeader className="pb-0">
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {kpi.label}
        </CardTitle>
        {actionSlot}
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
        {deltaPercent !== null && (
          <p
            className={cn(
              "text-xs font-medium",
              deltaPercent > 0
                ? "text-[#1D8844]"
                : deltaPercent < 0
                  ? "text-destructive"
                  : "text-muted-foreground"
            )}
          >
            {formatDeltaText(deltaPercent)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
