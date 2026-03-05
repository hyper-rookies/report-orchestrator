import ChannelPieChart from "@/components/dashboard/ChannelPieChart";
import KpiCard from "@/components/dashboard/KpiCard";
import TrendLineChart from "@/components/dashboard/TrendLineChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MOCK_CHANNEL_SHARE, MOCK_KPIS, MOCK_TREND } from "@/lib/dashboard-data";

export default function DashboardPage() {
  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-6">
      <div>
        <h1 className="text-xl font-semibold">대시보드</h1>
        <p className="mt-1 text-sm text-muted-foreground">2024년 11월 마케팅 데이터 요약</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {MOCK_KPIS.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">채널별 세션 비중</CardTitle>
          </CardHeader>
          <CardContent>
            <ChannelPieChart data={MOCK_CHANNEL_SHARE} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">최근 7일 트렌드</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendLineChart data={MOCK_TREND} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

