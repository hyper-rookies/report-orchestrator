import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface DashboardKpi {
  label: string;
  value: string;
  change?: string;
  positive?: boolean;
}

export default function KpiCard({ kpi }: { kpi: DashboardKpi }) {
  return (
    <Card className="nhn-panel gap-3 py-4">
      <CardHeader className="pb-0">
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {kpi.label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
        {typeof kpi.change === "string" && (
          <p className={cn("text-xs font-medium", kpi.positive ? "text-[#1D8844]" : "text-destructive")}>
            {kpi.change}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
