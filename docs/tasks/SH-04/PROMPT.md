# SH-04: ShareButton 컴포넌트

**전제 조건:** SH-02가 `"done"` 상태여야 한다 (POST /api/share 존재).

## 작업 개요

`frontend/src/components/dashboard/ShareButton.tsx`를 생성한다.
**다른 파일은 수정하지 않는다.**

## 생성할 파일

- `frontend/src/components/dashboard/ShareButton.tsx`

---

## 구현 코드

### `frontend/src/components/dashboard/ShareButton.tsx`

```tsx
"use client";

import { useState } from "react";
import { Share2, Copy, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WeekRange } from "@/components/dashboard/WeekSelector";

interface ShareButtonProps {
  selectedRange: WeekRange;
}

type ShareState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; url: string; expiresAt: string }
  | { status: "error"; message: string };

export default function ShareButton({ selectedRange }: ShareButtonProps) {
  const [state, setState] = useState<ShareState>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const handleShare = async () => {
    if (state.status === "done") {
      setOpen(true);
      return;
    }
    setState({ status: "loading" });
    setOpen(true);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart: selectedRange.start,
          weekEnd: selectedRange.end,
          weekLabel: selectedRange.label,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { url: string; expiresAt: string };
      setState({ status: "done", url: data.url, expiresAt: data.expiresAt });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "공유 링크 생성 실패",
      });
    }
  };

  const handleCopy = async () => {
    if (state.status !== "done") return;
    await navigator.clipboard.writeText(state.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const expiresLabel =
    state.status === "done"
      ? (() => {
          const d = new Date(state.expiresAt);
          return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
        })()
      : "";

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={handleShare} className="gap-1.5">
        <Share2 className="h-3.5 w-3.5" />
        공유
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border bg-card p-4 shadow-lg space-y-3">
          <button
            onClick={() => setOpen(false)}
            className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          <p className="text-sm font-semibold">링크 공유</p>

          {state.status === "loading" && (
            <p className="text-sm text-muted-foreground">링크 생성 중...</p>
          )}

          {state.status === "error" && (
            <p className="text-sm text-destructive">{state.message}</p>
          )}

          {state.status === "done" && (
            <>
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  ⚠️ 이 링크는 <strong>{expiresLabel}</strong>에 만료됩니다 (7일).
                  <br />
                  로그인 없이 누구나 조회할 수 있습니다.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={state.url}
                  className="flex-1 rounded-md border bg-muted px-2 py-1 text-xs font-mono text-muted-foreground select-all"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              {copied && (
                <p className="text-xs text-green-600 text-right">링크가 복사됐습니다!</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
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

- [ ] `frontend/src/components/dashboard/ShareButton.tsx` 생성됨
- [ ] `ShareButtonProps` → `selectedRange: WeekRange` prop 존재
- [ ] 모달: 로딩 / 오류 / 완료 세 상태 처리
- [ ] 완료 상태: 만료일 표시 (`⚠️ 이 링크는 <날짜>에 만료됩니다 (7일).`)
- [ ] 완료 상태: URL 인풋 + 복사 버튼 (복사 후 2초간 Check 아이콘)
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/SH-04/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SH-04 status → `"done"` 또는 `"blocked"`
3. `git add frontend/src/components/dashboard/ShareButton.tsx docs/tasks/SH-04/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(share): add ShareButton with expiry notice and copy link (SH-04)"`
```
