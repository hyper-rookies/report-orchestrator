import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiData } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

export default function KpiCard({ kpi }: { kpi: KpiData }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{kpi.value}</p>
        <p className={cn("mt-1 text-xs", kpi.positive ? "text-green-600" : "text-red-500")}>
          {kpi.change} vs 전주
        </p>
      </CardContent>
    </Card>
  );
}

