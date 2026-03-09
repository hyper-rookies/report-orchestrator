from __future__ import annotations

import json
import shutil
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from scripts.precompute_dashboard import (
    DashboardWeek,
    WEEKS,
    _athena_rows,
    _poll_athena,
    compute_week,
    main,
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
        athena,
        sql="SELECT 1",
        database="db",
        workgroup="wg",
        output_location="s3://bucket/out/",
        poll_interval=0,
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
            athena,
            sql="SELECT 1",
            database="db",
            workgroup="wg",
            output_location="s3://bucket/out/",
            poll_interval=0,
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
        athena=athena,
        week=week,
        database="hyper_intern_m1c",
        workgroup="wg",
        output_location="s3://bucket/out/",
        poll_interval=0,
    )
    assert athena.start_query_execution.call_count == 9
    assert set(result.keys()) >= {
        "week",
        "generatedAt",
        "sessions",
        "installs",
        "engagement",
        "trend_sessions",
        "trend_installs",
        "channel_revenue",
        "campaign_installs",
        "install_funnel",
        "retention",
    }


def test_save_week_json_writes_to_correct_path():
    data = {
        "week": {"start": "2024-11-22", "end": "2024-11-28", "label": "4주차"},
        "generatedAt": "2026-03-09T00:00:00Z",
        "sessions": [],
    }
    temp_root = Path(__file__).parent / ".tmp_sc02_test"
    try:
        path = save_week_json(data, out_dir=temp_root)
        assert path == temp_root / "week=2024-11-22_2024-11-28.json"
        loaded = json.loads(path.read_text(encoding="utf-8"))
        assert loaded["week"]["start"] == "2024-11-22"
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)


def test_main_contains_manifest_generation_code():
    code_obj = main.__code__
    constants_as_text = " ".join(str(c) for c in code_obj.co_consts if c is not None)
    assert "manifest.json" in constants_as_text
