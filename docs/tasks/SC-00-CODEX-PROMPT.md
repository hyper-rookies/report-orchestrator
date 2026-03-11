# Task SC-00: 리뷰 인프라 구축 (Static Cache Task Setup)

## 목적

코드를 작성하지 않는다. SC-01~SC-05 태스크의 구현 프롬프트와 리뷰 템플릿을 `docs/tasks/` 폴더에 생성하고, `docs/tasks/status.json`에 SC 태스크들을 추가한다.

---

## 배경 (최소 컨텍스트)

- **계획 문서:** `docs/plans/2026-03-09-dashboard-static-cache.md` — 반드시 읽고 시작할 것
- **프로젝트:** `report-orchestrator` — Python 백엔드(pytest), Next.js 프론트엔드(TypeScript, `npx tsc --noEmit`)
- **목표:** Bedrock SSE 9개 쿼리를 사전 집계 정적 JSON으로 교체해 로딩 45-135s → <1s
- **경고:** Windows 환경. 경로 구분자는 `/` 사용.

---

## 작업 내용

아래 파일들을 생성하라.

### 생성할 파일 목록

```
docs/tasks/
├── status.json              ← SC-01~05 항목 추가 (기존 DA-* 항목 유지)
├── SC-01/
│   ├── PROMPT.md
│   └── REPORT.md
├── SC-02/
│   ├── PROMPT.md
│   └── REPORT.md
├── SC-03/
│   ├── PROMPT.md
│   └── REPORT.md
├── SC-04/
│   ├── PROMPT.md
│   └── REPORT.md
└── SC-05/
    ├── PROMPT.md
    └── REPORT.md
```

---

## 파일 내용

### 1. `docs/tasks/status.json` 업데이트

기존 DA-* 항목은 그대로 두고 SC-* 항목을 추가한다:

```json
{
  "_note": "Codex: 태스크 완료 시 status를 'done'으로, 막히면 'blocked'로 변경하라.",
  "tasks": {
    "DA-01": { "status": "done", "title": "WeekSelector + ChannelRevenueChart 컴포넌트", "completedAt": "2026-03-09T11:21:01.0417894+09:00" },
    "DA-02": { "status": "done", "title": "ConversionChart + CampaignInstallsChart 컴포넌트", "completedAt": "2026-03-09T11:26:01.0020914+09:00" },
    "DA-03": { "status": "done", "title": "InstallFunnelChart + RetentionCohortChart 컴포넌트", "completedAt": "2026-03-09T11:27:00.9975318+09:00" },
    "DA-04": { "status": "done", "title": "useDashboardData.ts 확장", "completedAt": "2026-03-09T11:50:53.4476329+09:00" },
    "DA-05": { "status": "done", "title": "dashboard/page.tsx 통합", "completedAt": "2026-03-09T12:00:29.5166741+09:00" },
    "SC-01": { "status": "pending", "title": "dashboard_queries.py SQL 모듈 + pytest", "completedAt": null },
    "SC-02": { "status": "pending", "title": "precompute_dashboard.py Athena 실행 + pytest", "completedAt": null },
    "SC-03": { "status": "pending", "title": "스크립트 실행 → 5개 JSON + manifest 생성", "completedAt": null },
    "SC-04": { "status": "pending", "title": "useDashboardCache.ts + page.tsx manifest 방식 교체", "completedAt": null },
    "SC-05": { "status": "pending", "title": "REPORT.md 작성", "completedAt": null }
  }
}
```

---

### 2. `docs/tasks/SC-01/PROMPT.md`

```markdown
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

---

### 3. `docs/tasks/SC-01/REPORT.md`

```markdown
# SC-01 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `DASHBOARD_QUERIES`에 9개 키 모두 정의됨
- [ ] `build_dashboard_sql("trend_sessions", ...)` 결과에 `ORDER BY dt ASC` 포함
- [ ] `build_dashboard_sql("retention", ...)` 결과에 `SUM(cohort_size)` 포함
- [ ] 잘못된 날짜 형식 시 `ValueError` 발생
- [ ] 존재하지 않는 키 시 `KeyError` 발생
- [ ] `python -m pytest tests/test_dashboard_queries.py -v` → 9 passed

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `backend/scripts/dashboard_queries.py` | Created | ? |
| `backend/tests/test_dashboard_queries.py` | Created | ? |

---

## Test Output

```
$ cd backend && python -m pytest tests/test_dashboard_queries.py -v
(출력 붙여넣기)
```

---

## Deviations from Plan

없음 / (계획과 다른 점 기술)

---

## Questions for Reviewer

없음 / (리뷰어에게 물어볼 것)
```

---

### 4. `docs/tasks/SC-02/PROMPT.md`

```markdown
# SC-02: precompute_dashboard.py Athena 실행 스크립트

**전제 조건:** SC-01이 `docs/tasks/status.json`에서 `"done"` 상태여야 한다.

## 작업 개요

`backend/scripts/precompute_dashboard.py`와 `backend/tests/test_precompute_dashboard.py`를 생성한다.
**다른 파일은 수정하지 않는다.**

## 생성할 파일

- `backend/scripts/precompute_dashboard.py`
- `backend/tests/test_precompute_dashboard.py`

---

## 구현 코드

### `backend/scripts/precompute_dashboard.py`

```python
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, TypedDict

import boto3

sys.path.insert(0, str(Path(__file__).parent))
from dashboard_queries import DASHBOARD_QUERIES, build_dashboard_sql


class DashboardWeek(TypedDict):
    start: str
    end: str
    label: str


# 집계할 주차 목록. 달이 바뀌면 이 상수만 수정하고 스크립트를 재실행한다.
WEEKS: list[DashboardWeek] = [
    {"start": "2024-11-01", "end": "2024-11-07", "label": "2024년 11월 1주차"},
    {"start": "2024-11-08", "end": "2024-11-14", "label": "2024년 11월 2주차"},
    {"start": "2024-11-15", "end": "2024-11-21", "label": "2024년 11월 3주차"},
    {"start": "2024-11-22", "end": "2024-11-28", "label": "2024년 11월 4주차"},
    {"start": "2024-11-29", "end": "2024-11-30", "label": "2024년 11월 5주차"},
]


def _poll_athena(
    athena,
    sql: str,
    database: str,
    workgroup: str,
    output_location: str,
    poll_interval: float = 2.0,
) -> str:
    resp = athena.start_query_execution(
        QueryString=sql,
        QueryExecutionContext={"Database": database},
        WorkGroup=workgroup,
        ResultConfiguration={"OutputLocation": output_location},
    )
    exec_id: str = resp["QueryExecutionId"]
    while True:
        status_resp = athena.get_query_execution(QueryExecutionId=exec_id)
        state: str = status_resp["QueryExecution"]["Status"]["State"]
        if state == "SUCCEEDED":
            return exec_id
        if state in ("FAILED", "CANCELLED"):
            reason = status_resp["QueryExecution"]["Status"].get(
                "StateChangeReason", "No reason provided"
            )
            raise RuntimeError(f"Athena query {state}: {reason}\nSQL: {sql[:200]}")
        time.sleep(poll_interval)


def _athena_rows(athena, exec_id: str) -> list[dict[str, Any]]:
    result = athena.get_query_results(QueryExecutionId=exec_id)
    result_set = result["ResultSet"]
    columns = [c["Name"] for c in result_set["ResultSetMetadata"]["ColumnInfo"]]
    rows = result_set["Rows"]
    data_rows = rows[1:]  # 첫 행은 컬럼 헤더
    return [
        {col: row["Data"][i].get("VarCharValue", "") for i, col in enumerate(columns)}
        for row in data_rows
    ]


def compute_week(
    athena,
    week: DashboardWeek,
    database: str,
    workgroup: str,
    output_location: str,
    poll_interval: float = 2.0,
) -> dict[str, Any]:
    start = week["start"]
    end = week["end"]
    result: dict[str, Any] = {
        "week": week,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
    for key in DASHBOARD_QUERIES:
        sql = build_dashboard_sql(key, database, start, end)
        print(f"  [{key}] running...", flush=True)
        exec_id = _poll_athena(athena, sql, database, workgroup, output_location, poll_interval)
        result[key] = _athena_rows(athena, exec_id)
        print(f"  [{key}] done ({len(result[key])} rows)", flush=True)
    return result


def save_week_json(data: dict[str, Any], out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    start = data["week"]["start"]
    end = data["week"]["end"]
    path = out_dir / f"week={start}_{end}.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def main() -> None:
    database = os.environ.get("ATHENA_DATABASE", "hyper_intern_m1c")
    workgroup = os.environ.get("ATHENA_WORKGROUP", "hyper-intern-m1c-wg")
    output_location = os.environ.get(
        "ATHENA_OUTPUT_LOCATION",
        "s3://hyper-intern-m1c-athena-results-bucket/athena-results/precompute/",
    )
    repo_root = Path(__file__).parent.parent.parent
    out_dir = repo_root / "frontend" / "public" / "dashboard-cache"

    athena = boto3.client("athena", region_name=os.environ.get("AWS_REGION", "ap-northeast-2"))

    for week in WEEKS:
        print(f"\n=== {week['label']} ({week['start']} ~ {week['end']}) ===", flush=True)
        data = compute_week(athena, week, database, workgroup, output_location)
        path = save_week_json(data, out_dir=out_dir)
        print(f"  → saved: {path}", flush=True)

    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(list(WEEKS), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"  → manifest saved: {manifest_path}", flush=True)
    print("\n✓ 모든 주차 완료", flush=True)


if __name__ == "__main__":
    main()
```

### `backend/tests/test_precompute_dashboard.py`

```python
from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest

from scripts.precompute_dashboard import (
    DashboardWeek,
    WEEKS,
    _poll_athena,
    _athena_rows,
    compute_week,
    save_week_json,
)


def test_weeks_has_at_least_one_entry():
    assert len(WEEKS) >= 1


def test_all_weeks_have_required_keys():
    for w in WEEKS:
        assert "start" in w and "end" in w and "label" in w


def _make_athena_client(final_state: str = "SUCCEEDED"):
    client = MagicMock()
    client.start_query_execution.return_value = {"QueryExecutionId": "exec-123"}
    client.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": final_state}}
    }
    return client


def test_poll_athena_returns_execution_id_on_success():
    athena = _make_athena_client("SUCCEEDED")
    exec_id = _poll_athena(
        athena, sql="SELECT 1", database="db", workgroup="wg",
        output_location="s3://bucket/out/", poll_interval=0,
    )
    assert exec_id == "exec-123"


def test_poll_athena_raises_on_failed_state():
    athena = _make_athena_client("FAILED")
    athena.get_query_execution.return_value = {
        "QueryExecution": {
            "Status": {"State": "FAILED", "StateChangeReason": "Table not found"}
        }
    }
    with pytest.raises(RuntimeError, match="Table not found"):
        _poll_athena(
            athena, sql="SELECT 1", database="db", workgroup="wg",
            output_location="s3://bucket/out/", poll_interval=0,
        )


def test_athena_rows_parses_result_set():
    athena = MagicMock()
    athena.get_query_results.return_value = {
        "ResultSet": {
            "ResultSetMetadata": {
                "ColumnInfo": [{"Name": "channel_group"}, {"Name": "sessions"}]
            },
            "Rows": [
                {"Data": [{"VarCharValue": "channel_group"}, {"VarCharValue": "sessions"}]},
                {"Data": [{"VarCharValue": "organic"}, {"VarCharValue": "1234"}]},
                {"Data": [{"VarCharValue": "paid"}, {"VarCharValue": "567"}]},
            ],
        }
    }
    rows = _athena_rows(athena, "exec-123")
    assert rows == [
        {"channel_group": "organic", "sessions": "1234"},
        {"channel_group": "paid", "sessions": "567"},
    ]


def test_athena_rows_empty_result():
    athena = MagicMock()
    athena.get_query_results.return_value = {
        "ResultSet": {
            "ResultSetMetadata": {"ColumnInfo": [{"Name": "channel_group"}]},
            "Rows": [{"Data": [{"VarCharValue": "channel_group"}]}],
        }
    }
    rows = _athena_rows(athena, "exec-123")
    assert rows == []


def test_compute_week_calls_all_nine_queries():
    athena = _make_athena_client("SUCCEEDED")
    athena.get_query_results.return_value = {
        "ResultSet": {
            "ResultSetMetadata": {"ColumnInfo": [{"Name": "col"}]},
            "Rows": [{"Data": [{"VarCharValue": "col"}]}],
        }
    }
    week: DashboardWeek = {"start": "2024-11-22", "end": "2024-11-28", "label": "4주차"}
    result = compute_week(
        athena=athena, week=week, database="hyper_intern_m1c",
        workgroup="wg", output_location="s3://bucket/out/", poll_interval=0,
    )
    assert athena.start_query_execution.call_count == 9
    assert set(result.keys()) >= {
        "week", "generatedAt", "sessions", "installs", "engagement",
        "trend_sessions", "trend_installs", "channel_revenue",
        "campaign_installs", "install_funnel", "retention",
    }


def test_save_week_json_writes_to_correct_path(tmp_path):
    data = {
        "week": {"start": "2024-11-22", "end": "2024-11-28", "label": "4주차"},
        "generatedAt": "2026-03-09T00:00:00Z",
        "sessions": [],
    }
    path = save_week_json(data, out_dir=tmp_path)
    assert path == tmp_path / "week=2024-11-22_2024-11-28.json"
    loaded = json.loads(path.read_text(encoding="utf-8"))
    assert loaded["week"]["start"] == "2024-11-22"
```

---

## 검증 명령

```bash
cd backend
python -m pytest tests/test_precompute_dashboard.py -v
```

Expected: `9 passed`

## 수락 기준

- [ ] `_poll_athena` — SUCCEEDED 시 exec_id 반환, FAILED 시 RuntimeError
- [ ] `_athena_rows` — 헤더 행 제외, dict 리스트 반환
- [ ] `compute_week` — Athena 9회 호출, 9개 키 포함 dict 반환
- [ ] `save_week_json` — `week=<start>_<end>.json` 경로에 저장
- [ ] `main()` 마지막에 `manifest.json` 생성 코드 포함
- [ ] `python -m pytest tests/test_precompute_dashboard.py -v` → 9 passed

## 완료 후 할 일

1. `docs/tasks/SC-02/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SC-02 status → `"done"` 또는 `"blocked"`
3. `git add backend/scripts/precompute_dashboard.py backend/tests/test_precompute_dashboard.py docs/tasks/SC-02/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(scripts): add precompute_dashboard Athena runner (SC-02)"`
```

---

### 5. `docs/tasks/SC-02/REPORT.md`

```markdown
# SC-02 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `_poll_athena` — SUCCEEDED 시 exec_id 반환, FAILED 시 RuntimeError
- [ ] `_athena_rows` — 헤더 행 제외, dict 리스트 반환
- [ ] `compute_week` — Athena 9회 호출, 9개 키 포함 dict 반환
- [ ] `save_week_json` — `week=<start>_<end>.json` 경로에 저장
- [ ] `main()` 마지막에 `manifest.json` 생성 코드 포함
- [ ] `python -m pytest tests/test_precompute_dashboard.py -v` → 9 passed

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `backend/scripts/precompute_dashboard.py` | Created | ? |
| `backend/tests/test_precompute_dashboard.py` | Created | ? |

---

## Test Output

```
$ cd backend && python -m pytest tests/test_precompute_dashboard.py -v
(출력 붙여넣기)
```

---

## Deviations from Plan

없음 / (계획과 다른 점 기술)

---

## Questions for Reviewer

없음 / (리뷰어에게 물어볼 것)
```

---

### 6. `docs/tasks/SC-03/PROMPT.md`

```markdown
# SC-03: 스크립트 실행 → JSON + manifest 생성

**전제 조건:** SC-02가 `"done"` 상태여야 한다. AWS 자격증명이 설정되어 있어야 한다.

## 작업 개요

`precompute_dashboard.py`를 실행해 `frontend/public/dashboard-cache/`에 JSON 파일 5개와 `manifest.json` 1개를 생성한다. **코드는 수정하지 않는다.**

---

## Step 1: AWS 자격증명 확인

```bash
aws sts get-caller-identity
```

Expected: JSON with Account, UserId, Arn 출력. 오류 시 BLOCKED 처리.

## Step 2: 스크립트 실행

```bash
cd backend
python scripts/precompute_dashboard.py
```

(환경 변수가 이미 .env에 있거나 시스템에 설정된 경우 위 명령으로 충분. 아니면 아래):

```bash
ATHENA_DATABASE=hyper_intern_m1c \
ATHENA_WORKGROUP=hyper-intern-m1c-wg \
ATHENA_OUTPUT_LOCATION=s3://hyper-intern-m1c-athena-results-bucket/athena-results/precompute/ \
AWS_REGION=ap-northeast-2 \
python scripts/precompute_dashboard.py
```

## Step 3: 생성 파일 확인

```bash
ls frontend/public/dashboard-cache/
```

Expected 파일 목록:
```
manifest.json
week=2024-11-01_2024-11-07.json
week=2024-11-08_2024-11-14.json
week=2024-11-15_2024-11-21.json
week=2024-11-22_2024-11-28.json
week=2024-11-29_2024-11-30.json
```

## 수락 기준

- [ ] `frontend/public/dashboard-cache/manifest.json` 존재
- [ ] `frontend/public/dashboard-cache/week=2024-11-22_2024-11-28.json` 존재
- [ ] manifest.json이 유효한 JSON 배열 (`python -m json.tool manifest.json` 오류 없음)
- [ ] 각 week JSON에 9개 쿼리 키 (`sessions`, `installs`, `engagement`, ...) 존재

## 완료 후 할 일

1. `docs/tasks/SC-03/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SC-03 status → `"done"` 또는 `"blocked"`
3. `git add frontend/public/dashboard-cache/ docs/tasks/SC-03/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(data): add precomputed dashboard cache JSON (SC-03)"`
```

---

### 7. `docs/tasks/SC-03/REPORT.md`

```markdown
# SC-03 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `frontend/public/dashboard-cache/manifest.json` 존재
- [ ] `frontend/public/dashboard-cache/week=2024-11-22_2024-11-28.json` 존재
- [ ] manifest.json이 유효한 JSON 배열
- [ ] 각 week JSON에 9개 쿼리 키 존재

---

## Files Generated

| File | Rows (sessions query) |
|------|----------------------|
| `week=2024-11-01_2024-11-07.json` | ? |
| `week=2024-11-08_2024-11-14.json` | ? |
| `week=2024-11-15_2024-11-21.json` | ? |
| `week=2024-11-22_2024-11-28.json` | ? |
| `week=2024-11-29_2024-11-30.json` | ? |
| `manifest.json` | (5 entries) |

---

## Script Output (last 10 lines)

```
(출력 붙여넣기)
```

---

## Deviations from Plan

없음 / (Athena 오류 등 이슈 기술)

---

## Questions for Reviewer

없음 / (리뷰어에게 물어볼 것)
```

---

### 8. `docs/tasks/SC-04/PROMPT.md`

```markdown
# SC-04: useDashboardCache.ts + page.tsx 교체

**전제 조건:** SC-03이 `"done"` 상태여야 한다 (`frontend/public/dashboard-cache/` 파일 존재).

## 작업 개요

- `frontend/src/hooks/useDashboardCache.ts` 생성
- `frontend/src/app/(app)/dashboard/page.tsx` 수정

`useDashboardData.ts`는 삭제하지 않는다.

---

## 구현 코드

### `frontend/src/hooks/useDashboardCache.ts`

```typescript
"use client";

import { useEffect, useState } from "react";
import type { WeekRange } from "@/components/dashboard/WeekSelector";

interface CacheRow {
  [key: string]: string | number | undefined;
}

interface DashboardCacheJson {
  week: WeekRange;
  generatedAt: string;
  sessions: CacheRow[];
  installs: CacheRow[];
  engagement: CacheRow[];
  trend_sessions: CacheRow[];
  trend_installs: CacheRow[];
  channel_revenue: CacheRow[];
  campaign_installs: CacheRow[];
  install_funnel: CacheRow[];
  retention: CacheRow[];
}

export interface DashboardCacheData {
  totalSessions: number | null;
  totalInstalls: number | null;
  avgEngagementRate: number | null;
  channelShare: Array<{ name: string; value: number }>;
  trend: Array<{ date: string; sessions: number; installs: number }>;
  conversionByChannel: Array<{ channel: string; conversionRate: number }>;
  channelRevenue: Array<{ channel: string; revenue: number }>;
  campaignInstalls: Array<{ campaign: string; installs: number }>;
  installFunnel: Array<{ stage: string; count: number }>;
  retention: Array<{ day: number; retentionRate: number }>;
  loading: boolean;
  error: string | null;
}

const INITIAL: DashboardCacheData = {
  totalSessions: null, totalInstalls: null, avgEngagementRate: null,
  channelShare: [], trend: [], conversionByChannel: [],
  channelRevenue: [], campaignInstalls: [], installFunnel: [], retention: [],
  loading: true, error: null,
};

function parseNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").replace(/%/g, "").trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function normalizeDateLabel(dt: unknown): string | null {
  if (typeof dt !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dt)) return dt;
  const [, month, day] = dt.split("-");
  return `${month}/${day}`;
}

function parseCache(json: DashboardCacheJson): DashboardCacheData {
  const sessionsByChannel = new Map<string, number>();
  for (const row of json.sessions) {
    const ch = String(row.channel_group ?? "기타");
    sessionsByChannel.set(ch, (sessionsByChannel.get(ch) ?? 0) + parseNum(row.sessions));
  }
  const totalSessions = Array.from(sessionsByChannel.values()).reduce((a, b) => a + b, 0);
  const channelShare = Array.from(sessionsByChannel.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({
      name,
      value: totalSessions > 0 ? Number(((value / totalSessions) * 100).toFixed(1)) : 0,
    }));
  const conversionByChannel = json.sessions
    .map((row) => {
      const sessions = parseNum(row.sessions);
      if (row.conversions == null || sessions <= 0) return null;
      return { channel: String(row.channel_group ?? "Unknown"), conversionRate: parseNum(row.conversions) / sessions };
    })
    .filter((x): x is { channel: string; conversionRate: number } => x !== null);
  const totalInstalls = json.installs.reduce((a, r) => a + parseNum(r.installs), 0);
  const engValues = json.engagement
    .map((r) => parseNum(r.engagement_rate)).filter((v) => v > 0).map((v) => (v > 1 ? v / 100 : v));
  const avgEngagementRate = engValues.length > 0 ? engValues.reduce((a, b) => a + b, 0) / engValues.length : 0;
  const trendMap = new Map<string, { sessions: number; installs: number }>();
  for (const row of json.trend_sessions) {
    const dt = normalizeDateLabel(row.dt);
    if (!dt) continue;
    const curr = trendMap.get(dt) ?? { sessions: 0, installs: 0 };
    curr.sessions += parseNum(row.sessions);
    trendMap.set(dt, curr);
  }
  for (const row of json.trend_installs) {
    const dt = normalizeDateLabel(row.dt);
    if (!dt) continue;
    const curr = trendMap.get(dt) ?? { sessions: 0, installs: 0 };
    curr.installs += parseNum(row.installs);
    trendMap.set(dt, curr);
  }
  const trend = Array.from(trendMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0])).slice(-7)
    .map(([date, v]) => ({ date, sessions: Math.round(v.sessions), installs: Math.round(v.installs) }));
  const channelRevenue = json.channel_revenue.map((r) => ({
    channel: String(r.channel_group ?? "Unknown"), revenue: parseNum(r.total_revenue),
  }));
  const campaignInstalls = json.campaign_installs.map((r) => ({
    campaign: String(r.campaign ?? "Unknown"), installs: parseNum(r.installs),
  }));
  const installFunnel = json.install_funnel.map((r) => ({
    stage: String(r.event_name ?? "Unknown"), count: parseNum(r.event_count),
  }));
  const retention = json.retention
    .map((r) => {
      const cohortSize = parseNum(r.cohort_size);
      if (cohortSize <= 0) return null;
      return { day: parseNum(r.cohort_day), retentionRate: parseNum(r.retained_users) / cohortSize };
    })
    .filter((x): x is { day: number; retentionRate: number } => x !== null)
    .sort((a, b) => a.day - b.day);
  return {
    totalSessions: Math.round(totalSessions), totalInstalls: Math.round(totalInstalls),
    avgEngagementRate, channelShare, trend, conversionByChannel,
    channelRevenue, campaignInstalls, installFunnel, retention,
    loading: false, error: null,
  };
}

export function useDashboardCache(selectedRange: WeekRange): DashboardCacheData {
  const [data, setData] = useState<DashboardCacheData>(INITIAL);
  useEffect(() => {
    let cancelled = false;
    setData(INITIAL);
    const url = `/dashboard-cache/week=${selectedRange.start}_${selectedRange.end}.json`;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
        return res.json() as Promise<DashboardCacheJson>;
      })
      .then((json) => { if (!cancelled) setData(parseCache(json)); })
      .catch((err: unknown) => {
        if (!cancelled)
          setData((prev) => ({ ...prev, loading: false, error: err instanceof Error ? err.message : "캐시 로드 실패" }));
      });
    return () => { cancelled = true; };
  }, [selectedRange.start, selectedRange.end]);
  return data;
}
```

### `frontend/src/app/(app)/dashboard/page.tsx` 수정 내용

1. **import 교체:**

```typescript
// 제거
import { useDashboardData } from "@/hooks/useDashboardData";
// 추가
import { useDashboardCache } from "@/hooks/useDashboardCache";
import type { WeekRange } from "@/components/dashboard/WeekSelector";
```

2. **WEEKS 상수 제거, manifest fetch로 교체:**

```typescript
// 기존 WEEKS 상수 제거:
// const WEEKS: WeekRange[] = [...]  ← 삭제

// DashboardPage 함수 내 상태 추가:
const [weeks, setWeeks] = useState<WeekRange[]>([]);
const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);

useEffect(() => {
  fetch("/dashboard-cache/manifest.json")
    .then((r) => r.json() as Promise<WeekRange[]>)
    .then((data) => {
      setWeeks(data);
      setSelectedWeekIndex(Math.max(0, data.length - 2));
    });
}, []);
```

3. **훅 호출 교체:**

```typescript
// 제거
} = useDashboardData(selectedRange);
// 추가 (weeks가 비어있을 때 fallback)
const selectedRange = weeks[selectedWeekIndex] ?? { start: "", end: "", label: "" };
const {
  totalSessions, totalInstalls, avgEngagementRate,
  channelShare, conversionByChannel, channelRevenue,
  campaignInstalls, installFunnel, retention, trend,
  loading, error,
} = useDashboardCache(selectedRange);
```

4. **WeekSelector 조건부 렌더링 (weeks 로드 전 숨김):**

```typescript
{weeks.length > 0 && (
  <WeekSelector
    weeks={weeks}
    selectedIndex={selectedWeekIndex}
    onChange={(index) => {
      setSelectedWeekIndex(Math.min(Math.max(index, 0), weeks.length - 1));
    }}
  />
)}
```

5. **debug 블록 제거:** `DEBUG_DASHBOARD` 관련 `const` 선언과 JSX 블록 전체 삭제.

---

## 검증 명령

```bash
cd frontend && npx tsc --noEmit
```

Expected: 오류 없음 (exit code 0)

## 수락 기준

- [ ] `useDashboardCache.ts` 생성됨
- [ ] `page.tsx`에서 `useDashboardData` import 제거, `useDashboardCache` import 추가
- [ ] `WEEKS` 상수 제거, `manifest.json` fetch로 교체
- [ ] `weeks.length > 0` 조건부로 WeekSelector 렌더링
- [ ] debug 블록 제거됨
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/SC-04/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SC-04 status → `"done"` 또는 `"blocked"`
3. `git add frontend/src/hooks/useDashboardCache.ts frontend/src/app/\(app\)/dashboard/page.tsx docs/tasks/SC-04/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(dashboard): replace SSE queries with static cache hook (SC-04)"`
```

---

### 9. `docs/tasks/SC-04/REPORT.md`

```markdown
# SC-04 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `useDashboardCache.ts` 생성됨
- [ ] `page.tsx`에서 `useDashboardData` import 제거, `useDashboardCache` import 추가
- [ ] `WEEKS` 상수 제거, `manifest.json` fetch로 교체
- [ ] `weeks.length > 0` 조건부로 WeekSelector 렌더링
- [ ] debug 블록 제거됨
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines Before | Lines After |
|------|--------|-------------|-------------|
| `frontend/src/hooks/useDashboardCache.ts` | Created | — | ? |
| `frontend/src/app/(app)/dashboard/page.tsx` | Modified | ? | ? |

---

## TypeScript Check

```
$ cd frontend && npx tsc --noEmit
(출력 붙여넣기)
```

---

## Deviations from Plan

없음 / (계획과 다른 점 기술)

---

## Questions for Reviewer

없음 / (리뷰어에게 물어볼 것)
```

---

### 10. `docs/tasks/SC-05/PROMPT.md`

```markdown
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

---

### 11. `docs/tasks/SC-05/REPORT.md`

```markdown
# SC-05 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `docs/tasks/SC/REPORT.md` 생성됨
- [ ] 성과 테이블 채워짐
- [ ] 재집계 방법 기술됨

---

## Files Changed

| File | Action |
|------|--------|
| `docs/tasks/SC/REPORT.md` | Created |

---

## Deviations from Plan

없음

---

## Questions for Reviewer

없음
```

---

## 검증

```bash
ls docs/tasks/SC-01/
ls docs/tasks/SC-02/
ls docs/tasks/SC-03/
ls docs/tasks/SC-04/
ls docs/tasks/SC-05/
cat docs/tasks/status.json | python -m json.tool
```

모두 존재하면 완료.

## 완료 후 할 일

```bash
git add docs/tasks/
git commit -m "chore(tasks): add SC task management infrastructure (SC-00)"
```
