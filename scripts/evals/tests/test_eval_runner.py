from __future__ import annotations

import pytest

from scripts.evals.cases_v1 import ALL_CASES
from scripts.evals.eval_runner import (
    EvalConfig,
    PreflightError,
    build_aggregate_summary,
    compare_table_rows,
    execute_reference_query,
    extract_sse_frames,
    fetch_latest_dates,
    is_correct_refusal,
    looks_like_refusal,
    resolve_date_range,
    resolve_runtime_settings,
    validate_runtime_config,
)


def _case(case_id: str) -> dict:
    return next(case for case in ALL_CASES if case["id"] == case_id)


def test_resolve_date_range_fixed_month() -> None:
    case = _case("GA4A-01")
    resolved = resolve_date_range(case, latest_dates={})
    assert resolved.start == "2024-11-01"
    assert resolved.end == "2024-11-30"


def test_resolve_date_range_latest_last_7_days() -> None:
    case = _case("GA4A-07")
    resolved = resolve_date_range(case, latest_dates={"v_latest_ga4_acquisition_daily": "2026-03-11"})
    assert resolved.start == "2026-03-05"
    assert resolved.end == "2026-03-11"


def test_extract_sse_frames_handles_partial_buffer() -> None:
    chunk = (
        'event: meta\n'
        'data: {"reportId":"r-1"}\n\n'
        'event: chunk\n'
        'data: {"text":"hello"}\n\n'
        'event: final\n'
        'data: {"agentSummary":"done"}'
    )
    frames, remainder = extract_sse_frames(chunk)
    assert [frame["type"] for frame in frames] == ["meta", "chunk"]
    assert "event: final" in remainder


def test_compare_table_rows_matches_float_tolerance() -> None:
    expected = [{"media_source": "Google Ads", "retention_rate": 0.1234}]
    actual = [{"media_source": "Google Ads", "retention_rate": 0.12341}]
    compare = compare_table_rows(
        expected,
        actual,
        {"key_columns": ["media_source"], "value_columns": ["retention_rate"], "float_tolerance": 0.001},
    )
    assert compare["matched"] is True


def test_compare_table_rows_detects_mismatch() -> None:
    expected = [{"source": "google", "sessions": 100}]
    actual = [{"source": "google", "sessions": 88}]
    compare = compare_table_rows(
        expected,
        actual,
        {"key_columns": ["source"], "value_columns": ["sessions"], "float_tolerance": 0.0001},
    )
    assert compare["matched"] is False
    assert compare["reason"] == "value_mismatch:sessions"


def test_refusal_detection_from_error_code() -> None:
    case = _case("UNS-03")
    actual = {
        "table_rows": [],
        "error_code": "UNSUPPORTED_METRIC",
        "error_message": "지원하지 않는 차원입니다.",
        "final_summary": "",
        "streamed_text": "",
    }
    assert is_correct_refusal(case, actual) is True


def test_refusal_detection_from_text_without_error_code() -> None:
    case = _case("UNS-18")
    actual = {
        "table_rows": [],
        "error_code": None,
        "error_message": None,
        "final_summary": "현재 허용된 데이터 범위에서는 cross-view 계산을 지원하지 않습니다.",
        "streamed_text": "",
    }
    assert looks_like_refusal(actual["final_summary"]) is True
    assert is_correct_refusal(case, actual) is True


def test_refusal_detection_rejects_hallucinated_table() -> None:
    case = _case("UNS-16")
    actual = {
        "table_rows": [{"user_id": "u1"}],
        "error_code": None,
        "error_message": None,
        "final_summary": "원본 행을 보여드렸습니다.",
        "streamed_text": "",
    }
    assert is_correct_refusal(case, actual) is False


def test_resolve_runtime_settings_prefers_explicit_env_then_dotenv() -> None:
    resolved, sources = resolve_runtime_settings(
        {
            "ATHENA_DATABASE": "explicit-db",
            "ORCHESTRATOR_EVAL_URL": "https://explicit.lambda-url.ap-northeast-2.on.aws/",
        },
        {
            "ATHENA_DATABASE": ("root-db", "root:.env.local"),
        },
    )
    assert resolved["ATHENA_DATABASE"] == "explicit-db"
    assert sources["ATHENA_DATABASE"] == "env:ATHENA_DATABASE"


def test_validate_runtime_config_rejects_placeholders() -> None:
    config = EvalConfig(
        orchestrator_url="https://<eval-function-url>.lambda-url.ap-northeast-2.on.aws/",
        athena_database="hyper_intern_m1c",
        aws_region="ap-northeast-2",
    )
    with pytest.raises(PreflightError):
        validate_runtime_config(config)


def test_validate_runtime_config_accepts_real_seoul_defaults() -> None:
    config = EvalConfig(
        orchestrator_url="https://p2ci72n4le6v2ge3ni4ehwp7ce0eztwy.lambda-url.ap-northeast-2.on.aws/",
        athena_database="hyper_intern_m1c",
        aws_region="ap-northeast-2",
    )
    checks = validate_runtime_config(config)
    assert {check["name"] for check in checks} == {
        "orchestrator_url",
        "athena_database",
        "aws_region",
    }


def test_fetch_latest_dates_uses_eval_reference_api(monkeypatch: pytest.MonkeyPatch) -> None:
    config = EvalConfig(
        orchestrator_url="https://p2ci72n4le6v2ge3ni4ehwp7ce0eztwy.lambda-url.ap-northeast-2.on.aws/",
        athena_database="hyper_intern_m1c",
        aws_region="ap-northeast-2",
    )

    monkeypatch.setattr(
        "scripts.evals.eval_runner.call_eval_reference",
        lambda _config, _payload, timeout_seconds=None: {
            "version": "v1",
            "operation": "latestDates",
            "latestDates": {
                "v_latest_ga4_acquisition_daily": "2024-11-30",
                "v_latest_ga4_engagement_daily": "2024-11-30",
                "v_latest_appsflyer_installs_daily": "2024-11-30",
                "v_latest_appsflyer_events_daily": "2024-11-30",
                "v_latest_appsflyer_cohort_daily": "2024-11-30",
            },
        },
    )

    latest_dates = fetch_latest_dates(config)

    assert latest_dates["v_latest_ga4_acquisition_daily"] == "2024-11-30"
    assert latest_dates["v_latest_appsflyer_cohort_daily"] == "2024-11-30"


def test_execute_reference_query_uses_eval_reference_api(monkeypatch: pytest.MonkeyPatch) -> None:
    config = EvalConfig(
        orchestrator_url="https://p2ci72n4le6v2ge3ni4ehwp7ce0eztwy.lambda-url.ap-northeast-2.on.aws/",
        athena_database="hyper_intern_m1c",
        aws_region="ap-northeast-2",
        max_rows=50,
        query_timeout_seconds=15,
    )

    monkeypatch.setattr(
        "scripts.evals.eval_runner.call_eval_reference",
        lambda _config, payload, timeout_seconds=None: {
            "version": "v1",
            "operation": "executeQuery",
            "queryId": "query-123",
            "rows": [{"source": "google", "sessions": 123}],
            "rowCount": 1,
            "truncated": False,
            "echoed_sql": payload["sql"],
        },
    )

    query_id, rows, truncated = execute_reference_query(
        "SELECT source, SUM(sessions) AS sessions FROM hyper_intern_m1c.v_latest_ga4_acquisition_daily WHERE dt BETWEEN '2024-11-01' AND '2024-11-30' GROUP BY 1 ORDER BY sessions DESC LIMIT 20",
        config,
    )

    assert query_id == "query-123"
    assert rows == [{"source": "google", "sessions": 123}]
    assert truncated is False


def test_build_aggregate_summary_includes_baseline_deltas() -> None:
    current = [
        {
            "id": "CUR-01",
            "expectation": "supported",
            "answered": True,
            "data_correct": True,
            "correct_refusal": False,
            "expected_chart_type": "line",
            "chart_match": True,
            "time_to_first_chunk_ms": 100,
            "time_to_final_ms": 1000,
            "error_code": None,
            "failure_taxonomy": None,
            "view": "v_latest_ga4_acquisition_daily",
            "intent": "time_series",
            "overall_pass": True,
        },
        {
            "id": "CUR-02",
            "expectation": "unsupported",
            "answered": False,
            "data_correct": False,
            "correct_refusal": True,
            "expected_chart_type": None,
            "chart_match": None,
            "time_to_first_chunk_ms": 0,
            "time_to_final_ms": 10,
            "error_code": "UNSUPPORTED_METRIC",
            "failure_taxonomy": None,
            "view": "outside_scope",
            "intent": "unsupported",
            "overall_pass": True,
        },
    ]
    baseline = [
        {
            "id": "BASE-01",
            "expectation": "supported",
            "answered": False,
            "data_correct": False,
            "correct_refusal": False,
            "expected_chart_type": "line",
            "chart_match": False,
            "time_to_first_chunk_ms": 100,
            "time_to_final_ms": 1200,
            "error_code": "UNSUPPORTED_METRIC",
            "failure_taxonomy": "schema_gap",
            "view": "v_latest_ga4_acquisition_daily",
            "intent": "time_series",
            "overall_pass": False,
        },
        {
            "id": "BASE-02",
            "expectation": "unsupported",
            "answered": False,
            "data_correct": False,
            "correct_refusal": False,
            "expected_chart_type": None,
            "chart_match": None,
            "time_to_first_chunk_ms": 0,
            "time_to_final_ms": 10,
            "error_code": "UNKNOWN",
            "failure_taxonomy": "refusal_gap",
            "view": "outside_scope",
            "intent": "unsupported",
            "overall_pass": False,
        },
    ]

    aggregate = build_aggregate_summary(current, baseline_results=baseline)

    comparison = aggregate["comparison_vs_baseline"]
    assert comparison["supported_success_delta"] == pytest.approx(1.0)
    assert comparison["correct_refusal_delta"] == pytest.approx(1.0)
    assert comparison["chart_selection_accuracy_delta"] == pytest.approx(1.0)
