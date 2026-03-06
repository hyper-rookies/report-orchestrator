import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiData } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

export default function KpiCard({ kpi }: { kpi: KpiData }) {
  return (
    <Card className="nhn-panel gap-3 py-4">
      <CardHeader className="pb-0">
        <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {kpi.label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
        <p
          className={cn(
            "text-xs font-medium",
            kpi.positive ? "text-[#1D8844]" : "text-destructive"
          )}
        >
          {kpi.change} vs 전주
        </p>
      </CardContent>
    </Card>
  );
}
