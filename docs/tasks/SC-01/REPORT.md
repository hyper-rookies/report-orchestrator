# SC-01 Task Report

**Status:** DONE

**Completed At:** 2026-03-09T14:46:21.4831223+09:00

---

## Acceptance Criteria

- [x] `DASHBOARD_QUERIES`에 9개 키 모두 정의됨
- [x] `build_dashboard_sql("trend_sessions", ...)` 결과에 `ORDER BY dt ASC` 포함
- [x] `build_dashboard_sql("retention", ...)` 결과에 `SUM(cohort_size)` 포함
- [x] 잘못된 날짜 형식 시 `ValueError` 발생
- [x] 존재하지 않는 키 시 `KeyError` 발생
- [x] `python -m pytest tests/test_dashboard_queries.py -v` → 9 passed

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `backend/scripts/dashboard_queries.py` | Created | 84 |
| `backend/tests/test_dashboard_queries.py` | Created | 49 |

---

## Test Output

```text
$ cd backend && ..\.venv\Scripts\python.exe -m pytest tests/test_dashboard_queries.py -v
============================= test session starts =============================
platform win32 -- Python 3.14.3, pytest-9.0.2
collecting ... collected 9 items

tests/test_dashboard_queries.py::test_all_nine_query_keys_defined PASSED
tests/test_dashboard_queries.py::test_sessions_sql_contains_conversions PASSED
tests/test_dashboard_queries.py::test_trend_sessions_order_by_dt_asc PASSED
tests/test_dashboard_queries.py::test_trend_installs_order_by_dt_asc PASSED
tests/test_dashboard_queries.py::test_retention_has_cohort_size PASSED
tests/test_dashboard_queries.py::test_install_funnel_groups_by_event_name PASSED
tests/test_dashboard_queries.py::test_unknown_key_raises PASSED
tests/test_dashboard_queries.py::test_sql_injection_safe_dates PASSED
tests/test_dashboard_queries.py::test_invalid_end_date_raises PASSED

======================== 9 passed, 1 warning in 0.05s ========================
```

---

## Deviations from Plan

- 테스트 개수를 `9 passed`에 맞추기 위해 잘못된 종료일 포맷 검증 테스트 1건을 추가했다.

---

## Questions for Reviewer

없음
