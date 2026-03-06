from __future__ import annotations

import importlib.util
import json
import sys
import unittest.mock
from pathlib import Path

import pytest


def _add_service_path() -> None:
    service_dir = Path(__file__).resolve().parents[1] / "services" / "query-lambda"
    if str(service_dir) not in sys.path:
        sys.path.insert(0, str(service_dir))


_add_service_path()


# --- row_mapper tests ---


def _make_result_set(
    columns: list[tuple[str, str]],  # (name, type)
    data_rows: list[list[str]],       # each inner list = one row of VarCharValues
) -> dict:
    """Helper: build a merged ResultSet dict (header already stripped)."""
    return {
        "ResultSetMetadata": {
            "ColumnInfo": [{"Name": n, "Type": t} for n, t in columns]
        },
        "Rows": [
            {"Data": [{"VarCharValue": v} for v in row]}
            for row in data_rows
        ],
    }


def test_row_mapper_type_coercion():
    from row_mapper import map_result_set

    result_set = _make_result_set(
        columns=[
            ("channel_group", "VARCHAR"),
            ("sessions", "BIGINT"),
            ("revenue", "DOUBLE"),
            ("event_date", "DATE"),
        ],
        data_rows=[["organic", "10000", "123.45", "2026-01-01"]],
    )
    rows, _ = map_result_set(result_set, max_rows=100)

    assert len(rows) == 1
    row = rows[0]
    assert row["channel_group"] == "organic"        # str
    assert row["sessions"] == 10000                 # int
    assert isinstance(row["sessions"], int)
    assert row["revenue"] == 123.45                 # float
    assert isinstance(row["revenue"], float)
    assert row["event_date"] == "2026-01-01"        # str (DATE → str)


def test_row_mapper_strips_internal_columns():
    from row_mapper import map_result_set

    result_set = _make_result_set(
        columns=[
            ("channel_group", "VARCHAR"),
            ("_run_rank", "BIGINT"),
            ("sessions", "BIGINT"),
            ("run_id", "VARCHAR"),
        ],
        data_rows=[["organic", "1", "10000", "run-abc"]],
    )
    rows, _ = map_result_set(result_set, max_rows=100)

    assert len(rows) == 1
    assert "_run_rank" not in rows[0]
    assert "run_id" not in rows[0]
    assert rows[0] == {"channel_group": "organic", "sessions": 10000}


def test_row_mapper_store_reinstall_stays_str():
    from row_mapper import map_result_set

    result_set = _make_result_set(
        columns=[("store_reinstall", "VARCHAR"), ("installs", "BIGINT")],
        data_rows=[["true", "500"], ["false", "300"]],
    )
    rows, _ = map_result_set(result_set, max_rows=100)

    assert rows[0]["store_reinstall"] == "true"    # must remain str, NOT bool
    assert rows[1]["store_reinstall"] == "false"
    assert isinstance(rows[0]["store_reinstall"], str)


def test_row_mapper_truncated_flag_true_when_rows_equal_max():
    from row_mapper import map_result_set

    result_set = _make_result_set(
        columns=[("sessions", "BIGINT")],
        data_rows=[["1"], ["2"], ["3"]],  # 3 rows
    )
    rows, truncated = map_result_set(result_set, max_rows=3)

    assert len(rows) == 3
    assert truncated is True   # len == max_rows → truncated


def test_row_mapper_truncated_flag_false_when_rows_less_than_max():
    from row_mapper import map_result_set

    result_set = _make_result_set(
        columns=[("sessions", "BIGINT")],
        data_rows=[["1"], ["2"]],  # 2 rows
    )
    rows, truncated = map_result_set(result_set, max_rows=100)

    assert len(rows) == 2
    assert truncated is False


def test_row_mapper_slices_to_max_rows():
    from row_mapper import map_result_set

    result_set = _make_result_set(
        columns=[("n", "BIGINT")],
        data_rows=[[str(i)] for i in range(10)],  # 10 rows
    )
    rows, truncated = map_result_set(result_set, max_rows=5)

    assert len(rows) == 5
    assert truncated is True


# --- athena_runner tests (mock boto3) ---


def _mock_client_succeeded(query_execution_id: str = "qid-test-001") -> unittest.mock.MagicMock:
    """Returns a boto3 Athena mock that immediately succeeds."""
    client = unittest.mock.MagicMock()
    client.start_query_execution.return_value = {"QueryExecutionId": query_execution_id}
    client.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    client.get_query_results.return_value = {
        "ResultSet": {
            "ResultSetMetadata": {
                "ColumnInfo": [
                    {"Name": "channel_group", "Type": "VARCHAR"},
                    {"Name": "sessions", "Type": "BIGINT"},
                ]
            },
            "Rows": [
                {"Data": [{"VarCharValue": "channel_group"}, {"VarCharValue": "sessions"}]},
                {"Data": [{"VarCharValue": "organic"}, {"VarCharValue": "10000"}]},
            ],
        }
        # no NextToken → single page
    }
    return client


def test_athena_runner_timeout():
    """QUERY_TIMEOUT raised when state stays RUNNING past deadline."""
    from policy_guard import QueryError
    import athena_runner as ar

    mock_client = unittest.mock.MagicMock()
    mock_client.start_query_execution.return_value = {"QueryExecutionId": "qid-timeout"}
    mock_client.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "RUNNING"}}
    }

    # monotonic: 0.0 at start, 31.0 on first deadline check (exceeds timeout=30)
    with (
        unittest.mock.patch("boto3.client", return_value=mock_client),
        unittest.mock.patch("time.monotonic", side_effect=[0.0, 31.0]),
        unittest.mock.patch("time.sleep"),
    ):
        with pytest.raises(QueryError) as exc_info:
            ar.run_query(
                sql="SELECT 1",
                workgroup="wg",
                database="db",
                output_location="s3://bucket/",
                timeout_seconds=30,
                max_rows=100,
            )

    assert exc_info.value.code == "QUERY_TIMEOUT"
    assert "30s" in exc_info.value.message


def test_athena_runner_failed_state():
    """ATHENA_FAILED raised when Athena returns FAILED state."""
    from policy_guard import QueryError
    import athena_runner as ar

    mock_client = unittest.mock.MagicMock()
    mock_client.start_query_execution.return_value = {"QueryExecutionId": "qid-fail"}
    mock_client.get_query_execution.return_value = {
        "QueryExecution": {
            "Status": {
                "State": "FAILED",
                "StateChangeReason": "SYNTAX_ERROR: line 1:1",
            }
        }
    }

    with (
        unittest.mock.patch("boto3.client", return_value=mock_client),
        unittest.mock.patch("time.monotonic", return_value=0.0),
        unittest.mock.patch("time.sleep"),
    ):
        with pytest.raises(QueryError) as exc_info:
            ar.run_query(
                sql="SELECT bad syntax",
                workgroup="wg",
                database="db",
                output_location="s3://bucket/",
                timeout_seconds=30,
                max_rows=100,
            )

    assert exc_info.value.code == "ATHENA_FAILED"
    assert "SYNTAX_ERROR" in exc_info.value.message


def test_athena_runner_cancelled_state():
    """ATHENA_FAILED raised when Athena returns CANCELLED state."""
    from policy_guard import QueryError
    import athena_runner as ar

    mock_client = unittest.mock.MagicMock()
    mock_client.start_query_execution.return_value = {"QueryExecutionId": "qid-cancel"}
    mock_client.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "CANCELLED", "StateChangeReason": ""}}
    }

    with (
        unittest.mock.patch("boto3.client", return_value=mock_client),
        unittest.mock.patch("time.monotonic", return_value=0.0),
        unittest.mock.patch("time.sleep"),
    ):
        with pytest.raises(QueryError) as exc_info:
            ar.run_query(
                sql="SELECT 1",
                workgroup="wg",
                database="db",
                output_location="s3://bucket/",
                timeout_seconds=30,
                max_rows=100,
            )

    assert exc_info.value.code == "ATHENA_FAILED"


def test_athena_runner_success_returns_execution_id_and_result_set():
    """Happy path: returns (query_execution_id, result_set_dict) on SUCCEEDED."""
    import athena_runner as ar

    mock_client = _mock_client_succeeded("qid-happy")

    with (
        unittest.mock.patch("boto3.client", return_value=mock_client),
        unittest.mock.patch("time.monotonic", return_value=0.0),
        unittest.mock.patch("time.sleep"),
    ):
        qid, result_set = ar.run_query(
            sql="SELECT channel_group, sessions FROM ...",
            workgroup="wg",
            database="db",
            output_location="s3://bucket/",
            timeout_seconds=30,
            max_rows=100,
        )

    assert qid == "qid-happy"
    assert "ResultSetMetadata" in result_set
    assert "Rows" in result_set
    # header row is stripped in _fetch_result_set
    assert len(result_set["Rows"]) == 1
    assert result_set["Rows"][0]["Data"][0]["VarCharValue"] == "organic"


# --- handler routing + env fallback tests ---


def _load_handler_module():
    service_dir = Path(__file__).resolve().parents[1] / "services" / "query-lambda"
    if str(service_dir) not in sys.path:
        sys.path.insert(0, str(service_dir))
    module_path = service_dir / "handler.py"
    spec = importlib.util.spec_from_file_location("query_lambda_handler_v2", module_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


query_handler_v2 = _load_handler_module()


def _execute_event(overrides: dict | None = None) -> dict:
    base = {
        "version": "v1",
        "sql": "SELECT channel_group, sessions FROM hyper_intern_m1c.v_latest_ga4_acquisition_daily WHERE dt BETWEEN '2026-01-01' AND '2026-01-31' LIMIT 1000",
        "workgroup": "test-wg",
        "database": "test-db",
        "outputLocation": "s3://test-bucket/results/",
        "timeoutSeconds": 30,
        "maxRows": 100,
    }
    if overrides:
        base.update(overrides)
    return base


def _mock_athena_success() -> unittest.mock.MagicMock:
    mock_client = _mock_client_succeeded("qid-handler-001")
    return mock_client


def test_handler_execute_athena_query_success():
    """Happy path through lambda_handler for executeAthenaQuery."""
    mock_client = _mock_athena_success()

    with (
        unittest.mock.patch("boto3.client", return_value=mock_client),
        unittest.mock.patch("time.monotonic", return_value=0.0),
        unittest.mock.patch("time.sleep"),
    ):
        response = query_handler_v2.lambda_handler(_execute_event(), None)

    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["version"] == "v1"
    assert body["queryExecutionId"] == "qid-handler-001"
    assert isinstance(body["rows"], list)
    assert isinstance(body["rowCount"], int)
    assert isinstance(body["truncated"], bool)


def test_handler_execute_athena_query_missing_timeout_uses_default_30():
    """If timeoutSeconds is omitted, handler should default to 30."""
    event = {k: v for k, v in _execute_event().items() if k != "timeoutSeconds"}
    result_set = _make_result_set(
        columns=[("channel_group", "VARCHAR"), ("sessions", "BIGINT")],
        data_rows=[["organic", "10000"]],
    )

    with unittest.mock.patch(
        "athena_runner.run_query",
        return_value=("qid-default-timeout", result_set),
    ) as run_query_mock:
        response = query_handler_v2.lambda_handler(event, None)

    body = json.loads(response["body"])
    assert response["statusCode"] == 200
    assert body["queryExecutionId"] == "qid-default-timeout"
    assert run_query_mock.call_args.kwargs["timeout_seconds"] == 30


def test_handler_execute_athena_query_missing_maxrows_uses_default_500():
    """If maxRows is omitted, handler should default to 500."""
    event = {k: v for k, v in _execute_event().items() if k != "maxRows"}
    result_set = _make_result_set(
        columns=[("channel_group", "VARCHAR"), ("sessions", "BIGINT")],
        data_rows=[["organic", "10000"]],
    )

    with unittest.mock.patch(
        "athena_runner.run_query",
        return_value=("qid-default-maxrows", result_set),
    ) as run_query_mock:
        response = query_handler_v2.lambda_handler(event, None)

    body = json.loads(response["body"])
    assert response["statusCode"] == 200
    assert body["queryExecutionId"] == "qid-default-maxrows"
    assert run_query_mock.call_args.kwargs["max_rows"] == 500


def test_handler_env_defaults_for_workgroup_database_output(monkeypatch):
    """workgroup/database/outputLocation resolve from env when not in payload."""
    monkeypatch.setenv("ATHENA_WORKGROUP", "env-wg")
    monkeypatch.setenv("ATHENA_DATABASE", "env-db")
    monkeypatch.setenv("ATHENA_OUTPUT_LOCATION", "s3://env-bucket/results/")

    # Payload omits workgroup/database/outputLocation
    event = {k: v for k, v in _execute_event().items()
             if k not in ("workgroup", "database", "outputLocation")}

    mock_client = _mock_athena_success()

    with (
        unittest.mock.patch("boto3.client", return_value=mock_client),
        unittest.mock.patch("time.monotonic", return_value=0.0),
        unittest.mock.patch("time.sleep"),
    ):
        response = query_handler_v2.lambda_handler(event, None)

    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert "queryExecutionId" in body

    # Verify boto3 was called with env-resolved values
    call_kwargs = mock_client.start_query_execution.call_args[1]
    assert call_kwargs["WorkGroup"] == "env-wg"
    assert call_kwargs["QueryExecutionContext"]["Database"] == "env-db"
    assert call_kwargs["ResultConfiguration"]["OutputLocation"] == "s3://env-bucket/results/"


def test_handler_returns_unknown_when_all_connection_fields_missing(monkeypatch):
    """UNKNOWN error when workgroup/database/outputLocation absent from both payload and env."""
    monkeypatch.delenv("ATHENA_WORKGROUP", raising=False)
    monkeypatch.delenv("ATHENA_DATABASE", raising=False)
    monkeypatch.delenv("ATHENA_OUTPUT_LOCATION", raising=False)

    event = {k: v for k, v in _execute_event().items()
             if k not in ("workgroup", "database", "outputLocation")}

    response = query_handler_v2.lambda_handler(event, None)

    body = json.loads(response["body"])
    assert body["error"]["code"] == "UNKNOWN"
    assert "workgroup" in body["error"]["message"].lower() or "required" in body["error"]["message"].lower()


def test_handler_returns_query_timeout_from_athena_runner(monkeypatch):
    """QUERY_TIMEOUT propagates from athena_runner through lambda_handler."""
    from policy_guard import QueryError

    with unittest.mock.patch(
        "athena_runner.run_query",
        side_effect=QueryError("QUERY_TIMEOUT", "Athena query exceeded 30s timeout."),
    ):
        response = query_handler_v2.lambda_handler(_execute_event(), None)

    body = json.loads(response["body"])
    assert body["error"]["code"] == "QUERY_TIMEOUT"
    assert body["error"]["actionGroup"] == "query"


def test_handler_buildsql_still_works_after_routing_added():
    """Regression: buildSQL path must be unaffected by executeAthenaQuery routing."""
    build_sql_event = {
        "version": "v1",
        "view": "v_latest_ga4_acquisition_daily",
        "dateRange": {"start": "2026-01-01", "end": "2026-01-31"},
        "dimensions": ["channel_group"],
        "metrics": ["sessions"],
    }
    response = query_handler_v2.lambda_handler(build_sql_event, None)
    body = json.loads(response["body"])

    assert "sql" in body
    assert "WHERE dt BETWEEN" in body["sql"]


# --- explicit operation routing tests ---


def test_explicit_operation_buildsql_routes_correctly():
    """operation='buildSQL' routes to buildSQL path regardless of other keys."""
    event = {
        "version": "v1",
        "operation": "buildSQL",
        "view": "v_latest_ga4_acquisition_daily",
        "dateRange": {"start": "2026-01-01", "end": "2026-01-31"},
        "dimensions": ["channel_group"],
        "metrics": ["sessions"],
    }
    response = query_handler_v2.lambda_handler(event, None)
    body = json.loads(response["body"])

    assert "sql" in body
    assert "WHERE dt BETWEEN" in body["sql"]


def test_explicit_operation_executeathenaquery_routes_correctly():
    """operation='executeAthenaQuery' routes to Athena execution path."""
    event = _execute_event({"operation": "executeAthenaQuery"})
    mock_client = _mock_athena_success()

    with (
        unittest.mock.patch("boto3.client", return_value=mock_client),
        unittest.mock.patch("time.monotonic", return_value=0.0),
        unittest.mock.patch("time.sleep"),
    ):
        response = query_handler_v2.lambda_handler(event, None)

    body = json.loads(response["body"])
    assert body["version"] == "v1"
    assert "queryExecutionId" in body


def test_unknown_operation_returns_invalid_operation_error():
    """An unrecognised operation value must return INVALID_OPERATION."""
    event = {"operation": "deleteAll", "version": "v1"}
    response = query_handler_v2.lambda_handler(event, None)
    body = json.loads(response["body"])

    assert body["error"]["code"] == "INVALID_OPERATION"
    assert "deleteAll" in body["error"]["message"]


def test_ambiguous_payload_with_both_sql_and_view_returns_invalid_operation():
    """Payload that has BOTH 'sql' and 'view' but no 'operation' is ambiguous → INVALID_OPERATION."""
    event = {
        "version": "v1",
        "sql": "SELECT 1",
        "view": "v_latest_ga4_acquisition_daily",
    }
    response = query_handler_v2.lambda_handler(event, None)
    body = json.loads(response["body"])

    assert body["error"]["code"] == "INVALID_OPERATION"


def test_payload_with_neither_sql_nor_view_nor_operation_returns_invalid_operation():
    """Payload with no discriminating field returns INVALID_OPERATION."""
    event = {"version": "v1", "someRandomKey": "value"}
    response = query_handler_v2.lambda_handler(event, None)
    body = json.loads(response["body"])

    assert body["error"]["code"] == "INVALID_OPERATION"
