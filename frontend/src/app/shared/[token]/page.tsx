import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DataTable from "@/components/report/DataTable";
import { MOCK_REPORT } from "@/lib/mock-report";

interface Section {
  title: string;
  rows: Record<string, unknown>[];
}

interface ReportData {
  title: string;
  created_at: number;
  sections: Section[];
  error?: string;
}

async function fetchReport(token: string): Promise<ReportData> {
  if (process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true") {
    return MOCK_REPORT;
  }
  const url = `${process.env.NEXT_PUBLIC_REPORT_API_URL}?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { cache: "force-cache" });
  return res.json();
}

export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const report = await fetchReport(token);

  if (report.error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">{report.error}</p>
      </div>
    );
  }

  const createdDate = new Date(report.created_at * 1000).toLocaleDateString("ko-KR");

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">{report.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">생성일: {createdDate}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">읽기 전용 공유 링크</p>
      </div>

      {report.sections.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle className="text-base">{section.title}</CardTitle>
          </CardHeader>
          <CardContent>
            {section.rows.length > 0 ? (
              <DataTable rows={section.rows} />
            ) : (
              <p className="text-sm text-muted-foreground">데이터가 없습니다.</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

