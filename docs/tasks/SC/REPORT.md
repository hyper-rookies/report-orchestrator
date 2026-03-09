# Dashboard Static Cache - Final Report

**Status:** DONE

**Completed At:** 2026-03-09T16:10:10.3893468+09:00

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
- `frontend/public/dashboard-cache/week=*.json` (5개)
- `frontend/src/hooks/useDashboardCache.ts`

## 재집계 방법

새로운 달 데이터가 필요할 때:
1. `backend/scripts/precompute_dashboard.py`의 `WEEKS` 상수 수정
2. `python scripts/precompute_dashboard.py` 실행
3. `git add frontend/public/dashboard-cache/ && git commit -m "data: refresh dashboard cache"`
