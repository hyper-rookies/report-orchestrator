# SC-05: 최종 REPORT.md 작성

**전제 조건:** SC-04가 `"done"` 상태여야 한다.

## 작업 개요

`docs/tasks/SC/REPORT.md`를 생성해 이번 Static Cache 마이그레이션의 최종 결과를 기록한다.

## 생성할 파일

- `docs/tasks/SC/REPORT.md`

## 내용 (아래를 채워서 저장)

```markdown
# Dashboard Static Cache — Final Report

**Status:** DONE

**Completed At:** (ISO timestamp)

## 성과

| 지표 | Before | After |
|------|--------|-------|
| 대시보드 로딩 | 45-135초 | <1초 |
| Bedrock 호출 | 9회/로드 | 0회 |
| 주차 변경 대기 | 45-135초 | <1초 |

## 생성된 파일

- `backend/scripts/dashboard_queries.py`
- `backend/scripts/precompute_dashboard.py`
- `frontend/public/dashboard-cache/manifest.json`
- `frontend/public/dashboard-cache/week=*.json` (N개)
- `frontend/src/hooks/useDashboardCache.ts`

## 재집계 방법

새로운 달 데이터가 필요할 때:
1. `backend/scripts/precompute_dashboard.py`의 `WEEKS` 상수 수정
2. `python scripts/precompute_dashboard.py` 실행
3. `git add frontend/public/dashboard-cache/ && git commit -m "data: refresh dashboard cache"`
```

## 완료 후 할 일

1. `docs/tasks/status.json`에서 SC-05 status → `"done"`
2. `git add docs/tasks/SC/REPORT.md docs/tasks/status.json`
3. `git commit -m "docs: add static cache final report (SC-05)"`
```
