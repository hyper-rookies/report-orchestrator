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
        "ATHENA_OUTPUT_S3",
        "s3://hyper-intern-m1c-athena-results-bucket/athena-results/precompute/",
    )
    repo_root = Path(__file__).parent.parent.parent
    out_dir = repo_root / "frontend" / "public" / "dashboard-cache"

    athena = boto3.client("athena", region_name=os.environ.get("AWS_REGION", "ap-northeast-2"))

    for week in WEEKS:
        print(f"\n=== {week['label']} ({week['start']} ~ {week['end']}) ===", flush=True)
        data = compute_week(athena, week, database, workgroup, output_location)
        path = save_week_json(data, out_dir=out_dir)
        print(f"  -> saved: {path}", flush=True)

    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(list(WEEKS), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"  -> manifest saved: {manifest_path}", flush=True)
    print("\nOK: all weeks complete", flush=True)


if __name__ == "__main__":
    main()
