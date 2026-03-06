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
  const apiUrl = process.env.NEXT_PUBLIC_REPORT_API_URL;
  if (!apiUrl) {
    return { title: "", created_at: 0, sections: [], error: "리포트 API가 설정되지 않았습니다." };
  }
  try {
    const res = await fetch(`${apiUrl}?token=${encodeURIComponent(token)}`, {
      cache: "force-cache",
    });
    return res.json();
  } catch {
    return { title: "", created_at: 0, sections: [], error: "리포트를 불러오지 못했습니다." };
  }
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
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="rounded-xl border border-border/80 bg-card/95 px-4 py-3 text-muted-foreground">
          {report.error}
        </p>
      </div>
    );
  }

  const createdDate = new Date(report.created_at * 1000).toLocaleDateString("ko-KR");

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="nhn-panel px-6 py-5">
        <h1 className="text-2xl font-bold">{report.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">생성일: {createdDate}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">읽기 전용 공유 링크</p>
      </div>

      {report.sections.map((section) => (
        <Card key={section.title} className="nhn-panel">
          <CardHeader>
            <CardTitle className="text-base font-semibold">{section.title}</CardTitle>
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
