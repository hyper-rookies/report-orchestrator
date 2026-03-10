# SS-07: Sidebar 업데이트 + layout.tsx에 SessionProvider 추가

**전제 조건:** SS-06이 `"done"` 상태여야 한다.

## 작업 개요

`frontend/src/components/layout/Sidebar.tsx`와 `frontend/src/app/(app)/layout.tsx`를 수정한다.

## 수정할 파일

- `frontend/src/components/layout/Sidebar.tsx`
- `frontend/src/app/(app)/layout.tsx`

---

## 수정 내용

### `Sidebar.tsx` 수정

1. **import 추가:**

```typescript
import { useSessionContext } from "@/context/SessionContext";
import SessionListItem from "@/components/layout/SessionListItem";
```

2. **함수 내 상단에 추가:**

```typescript
const { sessions } = useSessionContext();
```

3. **FE-07 슬롯 교체:**

```tsx
// 기존
<div className="flex-1 overflow-y-auto px-3 pb-4 pt-2">{/* FE-07 conversation list */}</div>

// 변경
<div className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
  {sessions.length > 0 && (
    <p className="mb-2 px-1 text-xs font-semibold text-muted-foreground tracking-wide">
      최근 대화
    </p>
  )}
  <div className="space-y-0.5">
    {sessions.map((s) => (
      <SessionListItem
        key={s.sessionId}
        sessionId={s.sessionId}
        title={s.title}
        isActive={pathname === `/sessions/${s.sessionId}`}
      />
    ))}
  </div>
</div>
```

**참고:** `pathname`은 이미 `usePathname()`으로 선언되어 있음.

### `(app)/layout.tsx` 수정

```typescript
// import 추가
import { SessionProvider } from "@/context/SessionContext";

// JSX: 기존 최상위 div를 SessionProvider로 감싸기
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <div className="fixed inset-0 z-0 flex overflow-hidden nhn-subtle-grid">
        {/* 기존 내용 그대로 유지 */}
      </div>
    </SessionProvider>
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

- [ ] `Sidebar.tsx`에 `useSessionContext()` 호출 추가됨
- [ ] `Sidebar.tsx`의 FE-07 슬롯이 SessionListItem 목록으로 교체됨
- [ ] `(app)/layout.tsx`에 `SessionProvider`로 감싸짐
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/SS-07/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SS-07 status → `"done"` 또는 `"blocked"`
3. `git add frontend/src/components/layout/Sidebar.tsx "frontend/src/app/(app)/layout.tsx" docs/tasks/SS-07/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(sessions): update Sidebar with session list and add SessionProvider (SS-07)"`
