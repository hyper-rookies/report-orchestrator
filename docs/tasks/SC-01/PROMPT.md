# SC-01: dashboard_queries.py SQL 모듈

**전제 조건:** 없음 (독립)

## 작업 개요

`backend/scripts/dashboard_queries.py`와 `backend/tests/test_dashboard_queries.py`를 생성한다.
**다른 파일은 수정하지 않는다.**

## 생성할 파일

- `backend/scripts/dashboard_queries.py`
- `backend/tests/test_dashboard_queries.py`

---

## 구현 코드

### `backend/scripts/dashboard_queries.py`

```python
from __future__ import annotations

import re

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _validate_date(value: str) -> str:
    if not _DATE_RE.match(value):
        raise ValueError(f"Invalid date format: {value!r}. Expected YYYY-MM-DD.")
    return value


DASHBOARD_QUERIES: dict[str, dict] = {
    "sessions": {
        "view": "v_latest_ga4_acquisition_daily",
        "select": "channel_group, SUM(sessions) AS sessions, SUM(conversions) AS conversions",
        "group_by": "1",
        "order_by": "sessions DESC",
    },
    "installs": {
        "view": "v_latest_appsflyer_installs_daily",
        "select": "media_source, SUM(installs) AS installs",
        "group_by": "1",
        "order_by": "installs DESC",
    },
    "engagement": {
        "view": "v_latest_ga4_engagement_daily",
        "select": "channel_group, AVG(engagement_rate) AS engagement_rate",
        "group_by": "1",
        "order_by": "engagement_rate DESC",
    },
    "trend_sessions": {
        "view": "v_latest_ga4_acquisition_daily",
        "select": "dt, SUM(sessions) AS sessions",
        "group_by": "1",
        "order_by": "dt ASC",
    },
    "trend_installs": {
        "view": "v_latest_appsflyer_installs_daily",
        "select": "dt, SUM(installs) AS installs",
        "group_by": "1",
        "order_by": "dt ASC",
    },
    "channel_revenue": {
        "view": "v_latest_ga4_acquisition_daily",
        "select": "channel_group, SUM(total_revenue) AS total_revenue",
        "group_by": "1",
        "order_by": "total_revenue DESC",
    },
    "campaign_installs": {
        "view": "v_latest_appsflyer_installs_daily",
        "select": "campaign, SUM(installs) AS installs",
        "group_by": "1",
        "order_by": "installs DESC",
    },
    "install_funnel": {
        "view": "v_latest_appsflyer_events_daily",
        "select": "event_name, SUM(event_count) AS event_count",
        "group_by": "1",
        "order_by": "event_count DESC",
    },
    "retention": {
        "view": "v_latest_appsflyer_cohort_daily",
        "select": "cohort_day, SUM(retained_users) AS retained_users, SUM(cohort_size) AS cohort_size",
        "group_by": "1",
        "order_by": "cohort_day ASC",
    },
}


def build_dashboard_sql(key: str, database: str, start: str, end: str) -> str:
    _validate_date(start)
    _validate_date(end)
    q = DASHBOARD_QUERIES[key]
    return (
        f"SELECT {q['select']} "
        f"FROM {database}.{q['view']} "
        f"WHERE dt BETWEEN '{start}' AND '{end}' "
        f"GROUP BY {q['group_by']} "
        f"ORDER BY {q['order_by']} "
        f"LIMIT 500"
    )
```

### `backend/tests/test_dashboard_queries.py`

```python
import pytest
from scripts.dashboard_queries import build_dashboard_sql, DASHBOARD_QUERIES

DATABASE = "hyper_intern_m1c"
START = "2024-11-22"
END = "2024-11-28"


def test_all_nine_query_keys_defined():
    expected_keys = {
        "sessions", "installs", "engagement",
        "trend_sessions", "trend_installs",
        "channel_revenue", "campaign_installs",
        "install_funnel", "retention",
    }
    assert set(DASHBOARD_QUERIES.keys()) == expected_keys


def test_sessions_sql_contains_conversions():
    sql = build_dashboard_sql("sessions", DATABASE, START, END)
    assert "SUM(sessions)" in sql
    assert "SUM(conversions)" in sql
    assert "v_latest_ga4_acquisition_daily" in sql
    assert f"dt BETWEEN '{START}' AND '{END}'" in sql
    assert "GROUP BY 1" in sql


def test_trend_sessions_order_by_dt_asc():
    sql = build_dashboard_sql("trend_sessions", DATABASE, START, END)
    assert "ORDER BY dt ASC" in sql


def test_trend_installs_order_by_dt_asc():
    sql = build_dashboard_sql("trend_installs", DATABASE, START, END)
    assert "ORDER BY dt ASC" in sql


def test_retention_has_cohort_size():
    sql = build_dashboard_sql("retention", DATABASE, START, END)
    assert "SUM(retained_users)" in sql
    assert "SUM(cohort_size)" in sql
    assert "ORDER BY cohort_day ASC" in sql


def test_install_funnel_groups_by_event_name():
    sql = build_dashboard_sql("install_funnel", DATABASE, START, END)
    assert "event_name" in sql
    assert "SUM(event_count)" in sql


def test_unknown_key_raises():
    with pytest.raises(KeyError):
        build_dashboard_sql("nonexistent", DATABASE, START, END)


def test_sql_injection_safe_dates():
    with pytest.raises(ValueError):
        build_dashboard_sql("sessions", DATABASE, "'; DROP TABLE foo; --", END)
```

---

## 검증 명령

```bash
cd backend
python -m pytest tests/test_dashboard_queries.py -v
```

Expected: `9 passed`

## 수락 기준

- [ ] `DASHBOARD_QUERIES`에 9개 키 모두 정의됨
- [ ] `build_dashboard_sql("trend_sessions", ...)` 결과에 `ORDER BY dt ASC` 포함
- [ ] `build_dashboard_sql("retention", ...)` 결과에 `SUM(cohort_size)` 포함
- [ ] 잘못된 날짜 형식 시 `ValueError` 발생
- [ ] 존재하지 않는 키 시 `KeyError` 발생
- [ ] `python -m pytest tests/test_dashboard_queries.py -v` → 9 passed

## 완료 후 할 일

1. `docs/tasks/SC-01/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SC-01 status → `"done"` 또는 `"blocked"`
3. `git add backend/scripts/dashboard_queries.py backend/tests/test_dashboard_queries.py docs/tasks/SC-01/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(scripts): add dashboard_queries SQL builder module (SC-01)"`
```
