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
