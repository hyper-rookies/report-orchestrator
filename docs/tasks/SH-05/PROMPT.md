# SH-05: PdfExportButton 컴포넌트

**전제 조건:** SH-01이 `"done"` 상태여야 한다 (독립적이지만 SH 시리즈 순서 유지).

## 작업 개요

`frontend/src/components/dashboard/PdfExportButton.tsx`를 생성한다.
**다른 파일은 수정하지 않는다.**

## 사전 작업: 의존성 설치

```bash
cd frontend
npm install html2canvas jspdf
```

## 생성할 파일

- `frontend/src/components/dashboard/PdfExportButton.tsx`

---

## 구현 코드

### `frontend/src/components/dashboard/PdfExportButton.tsx`

```tsx
"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PdfExportButtonProps {
  targetId: string;   // 캡처할 DOM 요소의 id
  filename?: string;
}

export default function PdfExportButton({
  targetId,
  filename = "dashboard.pdf",
}: PdfExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const element = document.getElementById(targetId);
      if (!element) throw new Error(`Element #${targetId} not found`);

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: getComputedStyle(document.documentElement)
          .getPropertyValue("--background") || "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? "landscape" : "portrait",
        unit: "px",
        format: [canvas.width / 2, canvas.height / 2],
      });

      pdf.addImage(imgData, "PNG", 0, 0, canvas.width / 2, canvas.height / 2);
      pdf.save(filename);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={exporting}
      className="gap-1.5"
    >
      <Download className="h-3.5 w-3.5" />
      {exporting ? "저장 중..." : "PDF 저장"}
    </Button>
  );
}
```

---

## 검증 명령

```bash
cd frontend && npx tsc --noEmit
```

Expected: 오류 없음 (exit code 0)

## 수락 기준

- [ ] `frontend/src/components/dashboard/PdfExportButton.tsx` 생성됨
- [ ] `html2canvas`와 `jspdf`를 동적 import (`Promise.all`)로 사용
- [ ] `targetId` prop으로 캡처 대상 DOM id를 받음
- [ ] `exporting` 상태: 버튼 disabled + "저장 중..." 텍스트
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/SH-05/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SH-05 status → `"done"` 또는 `"blocked"`
3. `git add frontend/src/components/dashboard/PdfExportButton.tsx docs/tasks/SH-05/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(dashboard): add PdfExportButton with html2canvas (SH-05)"`
```
