from __future__ import annotations

import csv
import json
import os
import random
import re
import subprocess
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import urljoin
from typing import Any, Iterable, Mapping, Sequence

from scripts.evals.cases_v1 import ALL_CASES, Case, TARGET_VIEWS


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ORCHESTRATOR_URL_ENV = "NEXT_PUBLIC_SSE_URL"
DEFAULTS = {
    "AWS_REGION": "ap-northeast-2",
    "ATHENA_DATABASE": "hyper_intern_m1c",
}
DOTENV_FILES = (
    (REPO_ROOT / ".env.local", "root:.env.local"),
    (REPO_ROOT / "frontend" / ".env.local", "frontend:.env.local"),
)
SMOKE_CASE_IDS = (
    "GA4A-01",
    "GA4A-03",
    "GA4E-01",
    "AFI-01",
    "AFE-01",
    "AFC-01",
    "AFI-12",
    "UNS-03",
    "UNS-13",
    "UNS-18",
)
SUPPORTED_FAILURE_CODES = {"UNSUPPORTED_METRIC", "SCHEMA_VIOLATION", "NO_DATA"}
INFRA_FAILURE_CODES = {
    "ACTION_GROUP_CRASH",
    "ATHENA_ERROR",
    "HTTP_401",
    "HTTP_403",
    "HTTP_404",
    "HTTP_500",
    "HTTP_ERROR",
    "PARSE_ERROR",
    "QUERY_TIMEOUT",
    "REQUEST_ERROR",
    "STREAM_ENDED",
    "UNKNOWN",
}
REFUSAL_HINTS = (
    "\uc9c0\uc6d0\ud558\uc9c0",
    "\uc9c0\uc6d0 \ubd88\uac00",
    "\uc9c0\uc6d0 \ubc94\uc704",
    "\uc815\ud655\ud55c \uceec\ub7fc",
    "\uc815\ud655\ud55c \uc774\ub984",
    "\ucc3e\uc9c0 \ubabb",
    "\uc5c6\uc2b5\ub2c8\ub2e4",
    "\ud655\uc778\ud574",
    "\ubb38\uc758",
    "\ud604\uc7ac \ud5c8\uc6a9",
    "\uc2a4\ud0a4\ub9c8",
    "\ubd88\uac00\ub2a5",
)
FUNCTION_URL_RE = re.compile(r"^https://[A-Za-z0-9-]+\.lambda-url\.[a-z0-9-]+\.on\.aws/?$")
PLACEHOLDER_RE = re.compile(r"<[^>]+>")


@dataclass(frozen=True)
class EvalConfig:
    orchestrator_url: str
    athena_database: str
    suite_name: str = "v1"
    output_dir: Path | None = None
    aws_region: str | None = None
    bearer_token: str | None = None
    agent_alias_id: str | None = None
    build_sha: str | None = None
    timeout_seconds: int = 45
    query_timeout_seconds: int = 45
    max_rows: int = 500
    review_seed: int = 42
    config_sources: dict[str, str] | None = None


@dataclass(frozen=True)
class DateRange:
    start: str
    end: str
    label: str


@dataclass(frozen=True)
class PreflightResult:
    status: str
    checks: list[dict[str, str]]
    latest_dates: dict[str, str]
    reference_transport: str


class PreflightError(RuntimeError):
    pass


def load_cases(
    *,
    case_ids: Sequence[str] | None = None,
    limit: int | None = None,
    smoke: bool = False,
) -> list[Case]:
    selected_case_ids = list(case_ids or [])
    if smoke and not selected_case_ids:
        selected_case_ids = list(SMOKE_CASE_IDS)

    cases = ALL_CASES
    if selected_case_ids:
        case_id_set = {case_id.strip() for case_id in selected_case_ids if case_id.strip()}
        cases = [case for case in cases if case["id"] in case_id_set]
    if limit is not None:
        cases = cases[:limit]
    return list(cases)


def load_config_from_env(
    *,
    suite_name: str = "v1",
    output_dir: str | None = None,
    timeout_seconds: int = 45,
    review_seed: int = 42,
) -> EvalConfig:
    explicit_env = dict(os.environ)
    dotenv_values = load_dotenv_defaults()
    resolved_values, config_sources = resolve_runtime_settings(explicit_env, dotenv_values)
    base_output_dir = Path(output_dir) if output_dir else default_output_dir(suite_name)

    return EvalConfig(
        orchestrator_url=resolved_values["ORCHESTRATOR_EVAL_URL"],
        athena_database=resolved_values["ATHENA_DATABASE"],
        suite_name=suite_name,
        output_dir=base_output_dir,
        aws_region=resolved_values["AWS_REGION"],
        bearer_token=explicit_env.get("EVAL_BEARER_TOKEN"),
        agent_alias_id=explicit_env.get("EVAL_AGENT_ALIAS_ID") or explicit_env.get("BEDROCK_AGENT_ALIAS_ID"),
        build_sha=explicit_env.get("EVAL_BUILD_SHA") or resolve_git_sha(),
        timeout_seconds=timeout_seconds,
        query_timeout_seconds=int(explicit_env.get("EVAL_QUERY_TIMEOUT_SECONDS", timeout_seconds)),
        max_rows=int(explicit_env.get("EVAL_MAX_ROWS", "500")),
        review_seed=review_seed,
        config_sources=config_sources,
    )


def resolve_runtime_settings(
    explicit_env: Mapping[str, str],
    dotenv_values: Mapping[str, tuple[str, str]],
) -> tuple[dict[str, str], dict[str, str]]:
    resolved: dict[str, str] = {}
    sources: dict[str, str] = {}

    def resolve(
        key: str,
        *,
        fallback_env_keys: Sequence[str] = (),
        default: str | None = None,
    ) -> None:
        for env_key in (key, *fallback_env_keys):
            value = explicit_env.get(env_key)
            if value:
                resolved[key] = value
                sources[key] = f"env:{env_key}"
                return

        for env_key in (key, *fallback_env_keys):
            if env_key in dotenv_values:
                value, source = dotenv_values[env_key]
                resolved[key] = value
                sources[key] = source if env_key == key else f"{source}:{env_key}"
                return

        if default is not None:
            resolved[key] = default
            sources[key] = "repo-default"
            return

        raise PreflightError(f"Missing required configuration value: {key}")

    resolve("ORCHESTRATOR_EVAL_URL", fallback_env_keys=("ORCHESTRATOR_URL", DEFAULT_ORCHESTRATOR_URL_ENV))
    resolve("ATHENA_DATABASE", default=DEFAULTS["ATHENA_DATABASE"])
    resolve("AWS_REGION", fallback_env_keys=("AWS_DEFAULT_REGION",), default=DEFAULTS["AWS_REGION"])
    return resolved, sources


def load_dotenv_defaults() -> dict[str, tuple[str, str]]:
    values: dict[str, tuple[str, str]] = {}
    for path, label in DOTENV_FILES:
        if not path.exists():
            continue
        for key, value in read_dotenv_file(path).items():
            values[key] = (value, label)
    return values


def read_dotenv_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, raw_value = line.split("=", 1)
        key = key.strip()
        value = raw_value.strip().strip("\"").strip("'")
        if key:
            values[key] = value
    return values


def resolve_git_sha() -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=True,
        )
    except Exception:
        return None
    sha = result.stdout.strip()
    return sha or None


def default_output_dir(suite_name: str) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return REPO_ROOT / "tmp" / "evals" / f"{timestamp}_{suite_name}"


def apply_runtime_aws_env(config: EvalConfig) -> None:
    if config.aws_region:
        os.environ.setdefault("AWS_REGION", config.aws_region)
        os.environ.setdefault("AWS_DEFAULT_REGION", config.aws_region)


def validate_runtime_config(config: EvalConfig) -> list[dict[str, str]]:
    checks: list[dict[str, str]] = []
    _validate_no_placeholder(
        "ORCHESTRATOR_EVAL_URL",
        config.orchestrator_url,
        "Set a real Lambda Function URL, not the <eval-function-url> placeholder.",
    )
    _validate_function_url(config.orchestrator_url)
    checks.append({"name": "orchestrator_url", "status": "ok", "detail": config.orchestrator_url})

    if not config.athena_database.strip():
        raise PreflightError("ATHENA_DATABASE must not be empty.")
    checks.append({"name": "athena_database", "status": "ok", "detail": config.athena_database})

    if not config.aws_region or not config.aws_region.strip():
        raise PreflightError("AWS_REGION must not be empty.")
    checks.append({"name": "aws_region", "status": "ok", "detail": config.aws_region})
    return checks


def run_preflight(config: EvalConfig) -> PreflightResult:
    apply_runtime_aws_env(config)
    checks = validate_runtime_config(config)
    checks.append(probe_eval_api_access(config))
    latest_dates = fetch_latest_dates(config)
    checks.append({"name": "latest_dates", "status": "ok", "detail": json.dumps(latest_dates, ensure_ascii=False)})
    return PreflightResult(
        status="passed",
        checks=checks,
        latest_dates=latest_dates,
        reference_transport="orchestrator_eval_api",
    )


def eval_reference_url(config: EvalConfig) -> str:
    return urljoin(config.orchestrator_url.rstrip("/") + "/", "eval/reference")


def call_eval_reference(
    config: EvalConfig,
    payload: Mapping[str, Any],
    *,
    timeout_seconds: int | None = None,
) -> dict[str, Any]:
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if config.bearer_token:
        headers["Authorization"] = f"Bearer {config.bearer_token}"

    request = urllib.request.Request(
        eval_reference_url(config),
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    timeout = timeout_seconds or config.timeout_seconds

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        parsed_error = _extract_http_error(body)
        code = parsed_error.get("code") or f"HTTP_{exc.code}"
        message = parsed_error.get("message") or body or f"HTTP {exc.code}"
        raise PreflightError(f"Eval reference API failed with {code}: {message}") from exc
    except urllib.error.URLError as exc:
        raise PreflightError(f"Eval reference API request failed: {exc}") from exc

    try:
        parsed = json.loads(body)
    except json.JSONDecodeError as exc:
        raise PreflightError(f"Eval reference API returned invalid JSON: {body[:200]}") from exc
    if not isinstance(parsed, dict):
        raise PreflightError("Eval reference API response must be a JSON object.")
    return parsed


def probe_eval_api_access(config: EvalConfig) -> dict[str, str]:
    try:
        payload = call_eval_reference(config, {"operation": "latestDates"}, timeout_seconds=20)
    except PreflightError as exc:
        message = str(exc)
        if "HTTP_404" in message:
            raise PreflightError(
                "Eval reference API returned 404.\n"
                "Ensure ORCHESTRATOR_EVAL_URL points to the current orchestrator and that DISABLE_AUTH=true."
            ) from exc
        if "HTTP_401" in message:
            raise PreflightError(
                "Eval reference API returned 401 Unauthorized.\n"
                "This route is only available when DISABLE_AUTH=true on the orchestrator Lambda."
            ) from exc
        raise

    latest_dates = payload.get("latestDates")
    if not isinstance(latest_dates, dict):
        raise PreflightError("Eval reference API did not return latestDates in the expected shape.")
    return {
        "name": "eval_reference_probe",
        "status": "ok",
        "detail": f"{eval_reference_url(config)}",
    }


def fetch_latest_dates(config: EvalConfig) -> dict[str, str]:
    payload = call_eval_reference(config, {"operation": "latestDates"}, timeout_seconds=30)
    latest_dates = payload.get("latestDates")
    if not isinstance(latest_dates, dict):
        raise PreflightError("latestDates response is missing or malformed.")

    resolved: dict[str, str] = {}
    for view in TARGET_VIEWS:
        latest_dt = latest_dates.get(view)
        if not isinstance(latest_dt, str) or not latest_dt:
            raise PreflightError(f"Failed to resolve latest dt for {view}.")
        resolved[view] = latest_dt
    return resolved


def resolve_date_range(case: Case, latest_dates: dict[str, str]) -> DateRange:
    date_mode = case["date_mode"]
    date_window = case["date_window"]
    view = case["tags"]["view"]

    if date_mode == "fixed_2024_11":
        anchor = date(2024, 11, 30)
    elif date_mode == "latest_available":
        if view not in latest_dates:
            raise KeyError(f"latest dt is unavailable for view '{view}'.")
        anchor = date.fromisoformat(latest_dates[view])
    else:
        raise ValueError(f"Unsupported date_mode '{date_mode}'.")

    if date_window == "month":
        start = anchor.replace(day=1)
        end = anchor
    elif date_window == "last_7_days":
        start = anchor - timedelta(days=6)
        end = anchor
    elif date_window == "last_28_days":
        start = anchor - timedelta(days=27)
        end = anchor
    elif date_window == "single_day":
        start = anchor
        end = anchor
    else:
        raise ValueError(f"Unsupported date_window '{date_window}'.")

    return DateRange(start=start.isoformat(), end=end.isoformat(), label=f"{date_mode}:{date_window}")


def render_reference_query(template: str, config: EvalConfig, date_range: DateRange) -> str:
    rendered = template.format(database=config.athena_database)
    rendered = rendered.replace("{start_date}", date_range.start)
    rendered = rendered.replace("{end_date}", date_range.end)
    return rendered


def execute_reference_query(sql: str, config: EvalConfig) -> tuple[str, list[dict[str, Any]], bool]:
    payload = call_eval_reference(
        config,
        {
            "operation": "executeQuery",
            "sql": sql,
            "maxRows": config.max_rows,
            "timeoutSeconds": config.query_timeout_seconds,
        },
        timeout_seconds=config.timeout_seconds,
    )
    query_id = payload.get("queryId")
    rows = payload.get("rows")
    truncated = payload.get("truncated")
    if not isinstance(query_id, str):
        raise RuntimeError("Eval reference API did not return queryId.")
    if not isinstance(rows, list):
        raise RuntimeError("Eval reference API did not return rows.")
    if not isinstance(truncated, bool):
        raise RuntimeError("Eval reference API did not return truncated.")
    return query_id, [row for row in rows if isinstance(row, dict)], truncated


def parse_sse_block(block: str) -> dict[str, Any] | None:
    lines = [line for line in block.split("\n") if line.strip()]
    if not lines:
        return None

    event_type: str | None = None
    data_lines: list[str] = []
    for line in lines:
        if line.startswith("event:"):
            event_type = line.split(":", 1)[1].strip()
        elif line.startswith("data:"):
            data_lines.append(line.split(":", 1)[1].lstrip())

    if not event_type or not data_lines:
        return None

    try:
        data = json.loads("\n".join(data_lines))
    except json.JSONDecodeError:
        return None
    return {"type": event_type, "data": data}


def extract_sse_frames(buffer: str) -> tuple[list[dict[str, Any]], str]:
    normalized = buffer.replace("\r\n", "\n")
    blocks = normalized.split("\n\n")
    remainder = ""
    if not normalized.endswith("\n\n"):
        remainder = blocks.pop() if blocks else ""

    frames: list[dict[str, Any]] = []
    for block in blocks:
        frame = parse_sse_block(block)
        if frame is not None:
            frames.append(frame)
    return frames, remainder


def stream_orchestrator(question: str, config: EvalConfig) -> dict[str, Any]:
    headers = {"Content-Type": "application/json", "Accept": "text/event-stream"}
    if config.bearer_token:
        headers["Authorization"] = f"Bearer {config.bearer_token}"

    request = urllib.request.Request(
        config.orchestrator_url,
        data=json.dumps({"question": question, "autoApproveActions": True}).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    started = time.perf_counter()
    buffer = ""
    table_rows: list[dict[str, Any]] | None = None
    chart_type: str | None = None
    report_id: str | None = None
    final_summary = ""
    streamed_text: list[str] = []
    last_event: str | None = None
    event_count = 0
    time_to_first_chunk_ms: int | None = None

    try:
        with urllib.request.urlopen(request, timeout=config.timeout_seconds) as response:
            while True:
                chunk = response.read(4096)
                if not chunk:
                    break
                buffer += chunk.decode("utf-8", errors="replace")
                frames, buffer = extract_sse_frames(buffer)
                for frame in frames:
                    event_count += 1
                    last_event = frame["type"]
                    data = frame["data"]
                    if frame["type"] == "meta":
                        report_id = _safe_string(data.get("reportId"))
                    elif frame["type"] == "chunk":
                        text = _safe_string(data.get("text")) or ""
                        streamed_text.append(text)
                        if time_to_first_chunk_ms is None:
                            time_to_first_chunk_ms = _elapsed_ms(started)
                    elif frame["type"] == "table":
                        maybe_rows = data.get("rows")
                        if isinstance(maybe_rows, list):
                            table_rows = [row for row in maybe_rows if isinstance(row, dict)]
                    elif frame["type"] == "chart":
                        spec = data.get("spec")
                        if isinstance(spec, dict):
                            chart_type = _safe_string(spec.get("type"))
                    elif frame["type"] == "final":
                        final_summary = _safe_string(data.get("agentSummary")) or "".join(streamed_text).strip()
                        return {
                            "report_id": report_id,
                            "final_summary": final_summary,
                            "streamed_text": "".join(streamed_text).strip(),
                            "table_rows": table_rows or [],
                            "chart_type": chart_type,
                            "error_code": None,
                            "error_message": None,
                            "last_event": last_event,
                            "event_count": event_count,
                            "time_to_first_chunk_ms": time_to_first_chunk_ms,
                            "time_to_final_ms": _elapsed_ms(started),
                        }
                    elif frame["type"] == "error":
                        return {
                            "report_id": report_id,
                            "final_summary": "".join(streamed_text).strip(),
                            "streamed_text": "".join(streamed_text).strip(),
                            "table_rows": table_rows or [],
                            "chart_type": chart_type,
                            "error_code": _safe_string(data.get("code")) or "HTTP_ERROR",
                            "error_message": _safe_string(data.get("message")) or "Orchestrator returned an error.",
                            "last_event": last_event,
                            "event_count": event_count,
                            "time_to_first_chunk_ms": time_to_first_chunk_ms,
                            "time_to_final_ms": _elapsed_ms(started),
                        }
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        parsed_error = _extract_http_error(body)
        return {
            "report_id": None,
            "final_summary": "",
            "streamed_text": "",
            "table_rows": [],
            "chart_type": None,
            "error_code": parsed_error.get("code") or f"HTTP_{exc.code}",
            "error_message": parsed_error.get("message") or body or f"HTTP {exc.code}",
            "last_event": None,
            "event_count": event_count,
            "time_to_first_chunk_ms": None,
            "time_to_final_ms": _elapsed_ms(started),
        }
    except (urllib.error.URLError, TimeoutError) as exc:
        return {
            "report_id": None,
            "final_summary": "",
            "streamed_text": "",
            "table_rows": [],
            "chart_type": None,
            "error_code": "REQUEST_ERROR",
            "error_message": str(exc),
            "last_event": None,
            "event_count": event_count,
            "time_to_first_chunk_ms": None,
            "time_to_final_ms": _elapsed_ms(started),
        }

    return {
        "report_id": report_id,
        "final_summary": "".join(streamed_text).strip(),
        "streamed_text": "".join(streamed_text).strip(),
        "table_rows": table_rows or [],
        "chart_type": chart_type,
        "error_code": "STREAM_ENDED",
        "error_message": "Stream ended before final or error event.",
        "last_event": last_event,
        "event_count": event_count,
        "time_to_first_chunk_ms": time_to_first_chunk_ms,
        "time_to_final_ms": _elapsed_ms(started),
    }


def compare_table_rows(
    expected_rows: list[dict[str, Any]],
    actual_rows: list[dict[str, Any]],
    compare_spec: dict[str, Any],
) -> dict[str, Any]:
    key_columns = list(compare_spec["key_columns"])
    value_columns = list(compare_spec["value_columns"])
    columns = key_columns + value_columns
    tolerance = float(compare_spec.get("float_tolerance", 0.0001))

    missing_columns = sorted({column for row in actual_rows[:3] for column in columns if column not in row})
    if missing_columns:
        return {
            "matched": False,
            "reason": f"missing_columns:{','.join(missing_columns)}",
            "expected_preview": _preview_rows(expected_rows, columns),
            "actual_preview": _preview_rows(actual_rows, columns),
            "row_count_expected": len(expected_rows),
            "row_count_actual": len(actual_rows),
        }

    expected_sorted = sorted(
        [_project_row(row, columns) for row in expected_rows],
        key=lambda row: _sort_key(row, key_columns),
    )
    actual_sorted = sorted(
        [_project_row(row, columns) for row in actual_rows],
        key=lambda row: _sort_key(row, key_columns),
    )

    if len(expected_sorted) != len(actual_sorted):
        return {
            "matched": False,
            "reason": f"row_count_mismatch:{len(expected_sorted)}!={len(actual_sorted)}",
            "expected_preview": _preview_rows(expected_sorted, columns),
            "actual_preview": _preview_rows(actual_sorted, columns),
            "row_count_expected": len(expected_sorted),
            "row_count_actual": len(actual_sorted),
        }

    for expected_row, actual_row in zip(expected_sorted, actual_sorted):
        for column in key_columns:
            if expected_row.get(column) != actual_row.get(column):
                return {
                    "matched": False,
                    "reason": f"key_mismatch:{column}",
                    "expected_preview": _preview_rows(expected_sorted, columns),
                    "actual_preview": _preview_rows(actual_sorted, columns),
                    "row_count_expected": len(expected_sorted),
                    "row_count_actual": len(actual_sorted),
                }
        for column in value_columns:
            if not _value_matches(expected_row.get(column), actual_row.get(column), tolerance):
                return {
                    "matched": False,
                    "reason": f"value_mismatch:{column}",
                    "expected_preview": _preview_rows(expected_sorted, columns),
                    "actual_preview": _preview_rows(actual_sorted, columns),
                    "row_count_expected": len(expected_sorted),
                    "row_count_actual": len(actual_sorted),
                }

    return {
        "matched": True,
        "reason": "matched",
        "expected_preview": _preview_rows(expected_sorted, columns),
        "actual_preview": _preview_rows(actual_sorted, columns),
        "row_count_expected": len(expected_sorted),
        "row_count_actual": len(actual_sorted),
    }


def is_correct_refusal(case: Case, actual: dict[str, Any]) -> bool:
    if actual.get("table_rows"):
        return False

    error_code = actual.get("error_code")
    allowed_error_codes = set(case.get("allowed_error_codes") or [])
    if error_code in allowed_error_codes:
        return True
    if error_code in INFRA_FAILURE_CODES:
        return False

    combined_text = " ".join(
        text
        for text in (actual.get("error_message"), actual.get("final_summary"), actual.get("streamed_text"))
        if isinstance(text, str) and text.strip()
    )
    return looks_like_refusal(combined_text)


def looks_like_refusal(text: str | None) -> bool:
    if not text:
        return False
    normalized = text.strip().lower()
    return any(fragment.lower() in normalized for fragment in REFUSAL_HINTS)


def score_case_result(
    case: Case,
    *,
    actual: dict[str, Any],
    gold_rows: list[dict[str, Any]] | None = None,
    compare_result: dict[str, Any] | None = None,
) -> dict[str, Any]:
    expected_chart_type = case.get("expected_chart_type")
    chart_match = expected_chart_type is None or actual.get("chart_type") == expected_chart_type

    if case["expectation"] == "supported":
        answered = bool(actual.get("table_rows")) and actual.get("error_code") not in INFRA_FAILURE_CODES
        data_correct = bool(compare_result and compare_result["matched"])
        overall_pass = answered and data_correct and chart_match
        return {
            "answered": answered,
            "data_correct": data_correct,
            "correct_refusal": False,
            "chart_match": chart_match if expected_chart_type else None,
            "overall_pass": overall_pass,
            "failure_taxonomy": _classify_supported_failure(actual, data_correct, chart_match) if not overall_pass else None,
            "gold_row_count": len(gold_rows or []),
            "actual_row_count": len(actual.get("table_rows") or []),
        }

    correct_refusal = is_correct_refusal(case, actual)
    return {
        "answered": False,
        "data_correct": False,
        "correct_refusal": correct_refusal,
        "chart_match": None,
        "overall_pass": correct_refusal,
        "failure_taxonomy": None if correct_refusal else _classify_unsupported_failure(actual),
        "gold_row_count": None,
        "actual_row_count": len(actual.get("table_rows") or []),
    }


def evaluate_case(case: Case, *, config: EvalConfig, latest_dates: dict[str, str]) -> dict[str, Any]:
    date_range = resolve_date_range(case, latest_dates)
    result: dict[str, Any] = {
        "id": case["id"],
        "question": case["question"],
        "expectation": case["expectation"],
        "view": case["tags"]["view"],
        "intent": case["tags"]["intent"],
        "difficulty": case["tags"]["difficulty"],
        "date_mode": case["date_mode"],
        "date_window": case["date_window"],
        "resolved_start_date": date_range.start,
        "resolved_end_date": date_range.end,
        "expected_chart_type": case.get("expected_chart_type"),
        "reference_query": None,
        "reference_query_execution_id": None,
        "reference_rows_truncated": None,
        "gold_table_rows": None,
    }

    gold_rows: list[dict[str, Any]] | None = None
    compare_result: dict[str, Any] | None = None

    if case["expectation"] == "supported":
        rendered_sql = render_reference_query(case["reference_query"], config, date_range)
        query_execution_id, gold_rows, gold_truncated = execute_reference_query(rendered_sql, config)
        result.update(
            {
                "reference_query": rendered_sql,
                "reference_query_execution_id": query_execution_id,
                "reference_rows_truncated": gold_truncated,
                "gold_table_rows": gold_rows,
            }
        )

    actual = stream_orchestrator(case["question"], config)
    result.update(
        {
            "report_id": actual.get("report_id"),
            "last_event": actual.get("last_event"),
            "error_code": actual.get("error_code"),
            "error_message": actual.get("error_message"),
            "final_summary": actual.get("final_summary"),
            "streamed_text": actual.get("streamed_text"),
            "chart_type": actual.get("chart_type"),
            "time_to_first_chunk_ms": actual.get("time_to_first_chunk_ms"),
            "time_to_final_ms": actual.get("time_to_final_ms"),
            "event_count": actual.get("event_count"),
            "actual_table_rows": actual.get("table_rows"),
        }
    )

    if case["expectation"] == "supported" and gold_rows is not None:
        compare_result = compare_table_rows(
            expected_rows=gold_rows,
            actual_rows=actual.get("table_rows") or [],
            compare_spec=case["compare_spec"],
        )
        result["compare_result"] = compare_result

    score = score_case_result(case, actual=actual, gold_rows=gold_rows, compare_result=compare_result)
    result.update(score)
    return result


def run_suite(
    *,
    config: EvalConfig,
    cases: Sequence[Case],
    preflight: PreflightResult | None = None,
    baseline_results: Sequence[dict[str, Any]] | None = None,
    baseline_dir: str | None = None,
) -> dict[str, Any]:
    output_dir = config.output_dir or default_output_dir(config.suite_name)
    output_dir.mkdir(parents=True, exist_ok=True)

    preflight_result = preflight or run_preflight(config)
    results = [evaluate_case(case, config=config, latest_dates=preflight_result.latest_dates) for case in cases]
    aggregate = build_aggregate_summary(results, baseline_results=baseline_results)
    manifest = {
        "suite_name": config.suite_name,
        "case_count": len(cases),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "orchestrator_url": config.orchestrator_url,
        "agent_alias_id": config.agent_alias_id,
        "build_sha": config.build_sha,
        "config_source": config.config_sources or {},
        "preflight_status": preflight_result.status,
        "preflight_checks": preflight_result.checks,
        "reference_transport": preflight_result.reference_transport,
        "latest_dates": preflight_result.latest_dates,
        "baseline_dir": baseline_dir,
    }

    write_json(output_dir / "manifest.json", manifest)
    write_jsonl(output_dir / "per_case.jsonl", results)
    write_csv(output_dir / "aggregate.csv", results)
    write_text(output_dir / "baseline_report.md", build_baseline_report(manifest, aggregate, results))
    write_text(output_dir / "review_sample.md", build_review_sample(results, seed=config.review_seed))

    return {
        "output_dir": str(output_dir),
        "manifest": manifest,
        "aggregate": aggregate,
        "results": results,
    }


def build_aggregate_summary(
    results: Sequence[dict[str, Any]],
    *,
    baseline_results: Sequence[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    supported = [result for result in results if result["expectation"] == "supported"]
    unsupported = [result for result in results if result["expectation"] == "unsupported"]
    answered_supported = [result for result in supported if result["answered"]]
    chart_cases = [result for result in supported if result.get("expected_chart_type")]
    improvement_candidates = build_improvement_candidates(results)

    summary = {
        "supported_success_rate": _rate(sum(1 for result in supported if result["answered"]), len(supported)),
        "data_correctness_rate": _rate(
            sum(1 for result in answered_supported if result["data_correct"]),
            len(answered_supported),
        ),
        "correct_refusal_rate": _rate(
            sum(1 for result in unsupported if result["correct_refusal"]),
            len(unsupported),
        ),
        "chart_selection_accuracy": _rate(
            sum(1 for result in chart_cases if result["chart_match"]),
            len(chart_cases),
        ),
        "p50_ttfc_ms": _percentile(
            [value for value in (result["time_to_first_chunk_ms"] for result in results) if isinstance(value, int)],
            50,
        ),
        "p95_ttfc_ms": _percentile(
            [value for value in (result["time_to_first_chunk_ms"] for result in results) if isinstance(value, int)],
            95,
        ),
        "p50_ttfinal_ms": _percentile(
            [value for value in (result["time_to_final_ms"] for result in results) if isinstance(value, int)],
            50,
        ),
        "p95_ttfinal_ms": _percentile(
            [value for value in (result["time_to_final_ms"] for result in results) if isinstance(value, int)],
            95,
        ),
        "error_distribution": _count_by(results, "error_code"),
        "failure_taxonomy": _count_by(
            [result for result in results if result.get("failure_taxonomy")],
            "failure_taxonomy",
        ),
        "coverage_heatmap": build_coverage_heatmap(supported),
        "improvement_candidates": improvement_candidates,
    }
    if baseline_results is not None:
        summary["comparison_vs_baseline"] = build_comparison_vs_baseline(results, baseline_results)
    return summary


def build_comparison_vs_baseline(
    current_results: Sequence[dict[str, Any]],
    baseline_results: Sequence[dict[str, Any]],
) -> dict[str, Any]:
    baseline_summary = build_aggregate_summary(baseline_results)
    current_summary = build_aggregate_summary(current_results)
    return {
        "baseline_case_count": len(baseline_results),
        "supported_success_delta": current_summary["supported_success_rate"]
        - baseline_summary["supported_success_rate"],
        "data_correctness_delta": current_summary["data_correctness_rate"]
        - baseline_summary["data_correctness_rate"],
        "correct_refusal_delta": current_summary["correct_refusal_rate"]
        - baseline_summary["correct_refusal_rate"],
        "chart_selection_accuracy_delta": current_summary["chart_selection_accuracy"]
        - baseline_summary["chart_selection_accuracy"],
        "failure_taxonomy_delta": build_count_delta(
            current_summary["failure_taxonomy"], baseline_summary["failure_taxonomy"]
        ),
    }


def build_coverage_heatmap(results: Sequence[dict[str, Any]]) -> dict[str, dict[str, float]]:
    buckets: dict[str, dict[str, list[bool]]] = {}
    for result in results:
        view_bucket = buckets.setdefault(result["view"], {})
        view_bucket.setdefault(result["intent"], []).append(bool(result["overall_pass"]))
    return {
        view: {
            intent: _rate(sum(1 for passed in values if passed), len(values))
            for intent, values in intents.items()
        }
        for view, intents in buckets.items()
    }


def build_improvement_candidates(results: Sequence[dict[str, Any]]) -> list[str]:
    supported = [result for result in results if result["expectation"] == "supported"]
    unsupported = [result for result in results if result["expectation"] == "unsupported"]

    candidates: list[str] = []
    unsupported_metric_hits = [
        result["id"] for result in supported if result.get("error_code") == "UNSUPPORTED_METRIC"
    ]
    if unsupported_metric_hits:
        candidates.append(
            f"schema/prompt lane: supported cases hit UNSUPPORTED_METRIC {len(unsupported_metric_hits)} time(s) "
            f"({', '.join(unsupported_metric_hits[:4])}); review metric and dimension vocabulary plus buildSQL prompt."
        )

    data_mismatch_hits = [
        result["id"] for result in supported if result["answered"] and not result["data_correct"]
    ]
    if data_mismatch_hits:
        candidates.append(
            f"prompt lane: answered tables disagreed with Athena gold rows in {len(data_mismatch_hits)} case(s) "
            f"({', '.join(data_mismatch_hits[:4])}); inspect action orchestration and date resolution."
        )

    chart_mismatch_hits = [
        result["id"]
        for result in supported
        if result.get("expected_chart_type") and result.get("chart_match") is False
    ]
    if chart_mismatch_hits:
        candidates.append(
            f"chart lane: expected chart types mismatched in {len(chart_mismatch_hits)} case(s) "
            f"({', '.join(chart_mismatch_hits[:4])}); tune chart hints and selector rules."
        )

    refusal_failures = [result["id"] for result in unsupported if not result["correct_refusal"]]
    if refusal_failures:
        candidates.append(
            f"refusal lane: unsupported questions were not cleanly refused in {len(refusal_failures)} case(s) "
            f"({', '.join(refusal_failures[:4])}); tighten unsupported guardrails and no-table behavior."
        )

    infra_failures = [result["id"] for result in results if result.get("failure_taxonomy") == "infra_latency"]
    if infra_failures:
        candidates.append(
            f"infra lane: auth/env/network/timeout failures affected {len(infra_failures)} case(s) "
            f"({', '.join(infra_failures[:4])}); verify credentials, Function URL reachability, and timeout budgets."
        )

    if not candidates:
        candidates.append("No dominant failure lane detected in this run.")
    return candidates


def build_baseline_report(
    manifest: dict[str, Any],
    aggregate: dict[str, Any],
    results: Sequence[dict[str, Any]],
) -> str:
    failures = [result for result in results if not result["overall_pass"]]
    top_failures = sorted(
        failures,
        key=lambda result: (result["expectation"], result.get("failure_taxonomy") or "", result["id"]),
    )[:10]

    lines = [
        "# Agent Eval Baseline",
        "",
        f"- Generated at: `{manifest['generated_at']}`",
        f"- Suite: `{manifest['suite_name']}`",
        f"- Build SHA: `{manifest.get('build_sha') or 'unknown'}`",
        f"- Agent alias: `{manifest.get('agent_alias_id') or 'unknown'}`",
        f"- Reference transport: `{manifest.get('reference_transport') or 'unknown'}`",
        f"- Preflight: `{manifest['preflight_status']}`",
        f"- Cases: `{manifest['case_count']}`",
        "",
        "## Config Sources",
        "",
    ]
    for key, source in (manifest.get("config_source") or {}).items():
        lines.append(f"- `{key}` <- `{source}`")

    lines.extend(
        [
            "",
            "## Scorecard",
            "",
            f"- Supported success rate: `{aggregate['supported_success_rate']:.1%}`",
            f"- Data correctness rate: `{aggregate['data_correctness_rate']:.1%}`",
            f"- Correct refusal rate: `{aggregate['correct_refusal_rate']:.1%}`",
            f"- Chart selection accuracy: `{aggregate['chart_selection_accuracy']:.1%}`",
            f"- p50 TTFC: `{aggregate['p50_ttfc_ms']}` ms",
            f"- p95 TTFC: `{aggregate['p95_ttfc_ms']}` ms",
            f"- p50 TTFinal: `{aggregate['p50_ttfinal_ms']}` ms",
            f"- p95 TTFinal: `{aggregate['p95_ttfinal_ms']}` ms",
            "",
            "## Latest dt",
            "",
        ]
    )
    comparison = aggregate.get("comparison_vs_baseline")
    if isinstance(comparison, dict):
        lines.extend(
            [
                "",
                "## Comparison vs Baseline",
                "",
                f"- Baseline cases: `{comparison['baseline_case_count']}`",
                f"- Supported success delta: `{comparison['supported_success_delta']:+.1%}`",
                f"- Data correctness delta: `{comparison['data_correctness_delta']:+.1%}`",
                f"- Correct refusal delta: `{comparison['correct_refusal_delta']:+.1%}`",
                f"- Chart selection accuracy delta: `{comparison['chart_selection_accuracy_delta']:+.1%}`",
            ]
        )
        failure_delta = comparison.get("failure_taxonomy_delta") or {}
        if failure_delta:
            lines.append("- Failure taxonomy delta:")
            for taxonomy, delta in failure_delta.items():
                lines.append(f"  - `{taxonomy}`: `{delta:+d}`")
    for view, latest_dt in manifest["latest_dates"].items():
        lines.append(f"- `{view}`: `{latest_dt}`")

    lines.extend(["", "## Failure Taxonomy", ""])
    for taxonomy, count in aggregate["failure_taxonomy"].items():
        lines.append(f"- `{taxonomy}`: `{count}`")

    lines.extend(["", "## Error Distribution", ""])
    for error_code, count in aggregate["error_distribution"].items():
        lines.append(f"- `{error_code}`: `{count}`")

    lines.extend(["", "## Coverage Heatmap", "", "| View | Intent | Pass Rate |", "| --- | --- | --- |"])
    for view, intents in aggregate["coverage_heatmap"].items():
        for intent, pass_rate in intents.items():
            lines.append(f"| `{view}` | `{intent}` | `{pass_rate:.1%}` |")

    lines.extend(["", "## Top Failures", ""])
    if not top_failures:
        lines.append("- No failures.")
    for result in top_failures:
        lines.extend(
            [
                f"- `{result['id']}` `{result['question']}`",
                f"  - taxonomy: `{result.get('failure_taxonomy') or 'n/a'}`",
                f"  - error: `{result.get('error_code') or 'none'}`",
                f"  - summary: `{_truncate(result.get('final_summary') or result.get('error_message') or '', 200)}`",
            ]
        )

    lines.extend(["", "## Improvement Candidates", ""])
    for candidate in aggregate["improvement_candidates"]:
        lines.append(f"- {candidate}")

    return "\n".join(lines) + "\n"


def build_review_sample(results: Sequence[dict[str, Any]], *, seed: int = 42) -> str:
    rng = random.Random(seed)
    passing = [result for result in results if result["overall_pass"]]
    failing = [result for result in results if not result["overall_pass"]]
    sample = _sample(rng, passing, 10) + _sample(rng, failing, 10)

    lines = [
        "# Manual Review Sample",
        "",
        f"- Seed: `{seed}`",
        f"- Passing sampled: `{min(10, len(passing))}`",
        f"- Failing sampled: `{min(10, len(failing))}`",
        "",
    ]
    for result in sample:
        lines.extend(
            [
                f"## {result['id']}",
                "",
                f"- Expectation: `{result['expectation']}`",
                f"- Question: {result['question']}",
                f"- Final summary: {_truncate(result.get('final_summary') or '', 240)}",
                f"- Error: `{result.get('error_code') or 'none'}` / {_truncate(result.get('error_message') or '', 120)}",
                f"- Gold preview: `{json.dumps((result.get('gold_table_rows') or [])[:3], ensure_ascii=False)}`",
                f"- Actual preview: `{json.dumps((result.get('actual_table_rows') or [])[:3], ensure_ascii=False)}`",
                "- Review checklist:",
                "  - Date range mention accuracy",
                "  - Metric / dimension interpretation",
                "  - Hallucination check",
                "  - Unsupported explanation quality",
                "",
            ]
        )
    return "\n".join(lines)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def write_jsonl(path: Path, rows: Sequence[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_csv(path: Path, rows: Sequence[dict[str, Any]]) -> None:
    fieldnames = [
        "id",
        "expectation",
        "view",
        "intent",
        "difficulty",
        "resolved_start_date",
        "resolved_end_date",
        "answered",
        "data_correct",
        "correct_refusal",
        "chart_match",
        "overall_pass",
        "failure_taxonomy",
        "error_code",
        "chart_type",
        "expected_chart_type",
        "report_id",
        "time_to_first_chunk_ms",
        "time_to_final_ms",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field) for field in fieldnames})


def write_text(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def load_result_rows(baseline_dir: str | Path) -> list[dict[str, Any]]:
    path = Path(baseline_dir) / "per_case.jsonl"
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def format_config_summary(config: EvalConfig) -> str:
    lines = [
        "Eval config:",
        f"  orchestrator_url : {config.orchestrator_url}",
        f"  athena_database  : {config.athena_database}",
        f"  aws_region       : {config.aws_region or 'unset'}",
        "  reference_api    : /eval/reference",
    ]
    if config.config_sources:
        lines.append("  config_sources   :")
        for key, source in config.config_sources.items():
            lines.append(f"    - {key}: {source}")
    return "\n".join(lines)


def format_preflight_summary(preflight: PreflightResult) -> str:
    lines = [f"Preflight: {preflight.status}"]
    for check in preflight.checks:
        lines.append(f"  - {check['name']}: {check['status']} ({check['detail']})")
    return "\n".join(lines)


def _extract_http_error(body: str) -> dict[str, str]:
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        return {}
    if not isinstance(parsed, dict):
        return {}
    nested_error = parsed.get("error")
    if isinstance(nested_error, dict):
        return {
            "code": _safe_string(nested_error.get("code")) or "",
            "message": _safe_string(nested_error.get("message")) or "",
        }
    message = parsed.get("message") or nested_error
    return {
        "code": _safe_string(parsed.get("code")) or "",
        "message": _safe_string(message) or "",
    }


def _validate_no_placeholder(name: str, value: str, guidance: str) -> None:
    if PLACEHOLDER_RE.search(value):
        raise PreflightError(f"{name} contains a placeholder value.\n{guidance}")


def _validate_function_url(value: str) -> None:
    if not FUNCTION_URL_RE.fullmatch(value):
        raise PreflightError(
            "ORCHESTRATOR_EVAL_URL must be a Lambda Function URL root, "
            "for example https://abc.lambda-url.ap-northeast-2.on.aws/"
        )


def _safe_string(value: Any) -> str | None:
    return value if isinstance(value, str) and value.strip() else None


def _elapsed_ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)


def _project_row(row: dict[str, Any], columns: Iterable[str]) -> dict[str, Any]:
    return {column: row.get(column) for column in columns}


def _sort_key(row: dict[str, Any], key_columns: Sequence[str]) -> tuple[Any, ...]:
    return tuple(_sortable(row.get(column)) for column in key_columns)


def _sortable(value: Any) -> tuple[int, Any]:
    if value is None:
        return (0, "")
    if isinstance(value, (int, float)):
        return (1, value)
    return (2, str(value))


def _value_matches(expected: Any, actual: Any, tolerance: float) -> bool:
    expected_number = _maybe_number(expected)
    actual_number = _maybe_number(actual)
    if expected_number is not None and actual_number is not None:
        return abs(expected_number - actual_number) <= tolerance
    return expected == actual


def _maybe_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        normalized = value.replace(",", "").replace("%", "").strip()
        try:
            return float(normalized)
        except ValueError:
            return None
    return None


def _preview_rows(rows: Sequence[dict[str, Any]], columns: Sequence[str], *, limit: int = 3) -> list[dict[str, Any]]:
    return [{column: row.get(column) for column in columns} for row in rows[:limit]]


def _classify_supported_failure(actual: dict[str, Any], data_correct: bool, chart_match: bool) -> str | None:
    error_code = actual.get("error_code")
    if error_code == "QUERY_TIMEOUT":
        return "infra_latency"
    if error_code in INFRA_FAILURE_CODES:
        return "infra_latency"
    if error_code in SUPPORTED_FAILURE_CODES:
        return "schema_gap"
    if not data_correct:
        return "prompt_gap"
    if not chart_match:
        return "chart_gap"
    return None


def _classify_unsupported_failure(actual: dict[str, Any]) -> str:
    if actual.get("error_code") in INFRA_FAILURE_CODES:
        return "infra_latency"
    if actual.get("table_rows"):
        return "refusal_gap"
    return "schema_gap"


def _rate(numerator: int, denominator: int) -> float:
    if denominator == 0:
        return 0.0
    return numerator / denominator


def _percentile(values: Sequence[int], percentile: int) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    rank = max(0, min(len(ordered) - 1, round((percentile / 100) * (len(ordered) - 1))))
    return ordered[rank]


def _count_by(rows: Sequence[dict[str, Any]], field: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in rows:
        value = row.get(field)
        if value in (None, ""):
            continue
        key = str(value)
        counts[key] = counts.get(key, 0) + 1
    return dict(sorted(counts.items(), key=lambda item: (-item[1], item[0])))


def build_count_delta(current: Mapping[str, int], baseline: Mapping[str, int]) -> dict[str, int]:
    keys = sorted(set(current) | set(baseline))
    return {
        key: current.get(key, 0) - baseline.get(key, 0)
        for key in keys
        if current.get(key, 0) != baseline.get(key, 0)
    }


def _sample(rng: random.Random, rows: Sequence[dict[str, Any]], size: int) -> list[dict[str, Any]]:
    if len(rows) <= size:
        return list(rows)
    return rng.sample(list(rows), size)


def _truncate(value: str, length: int) -> str:
    if len(value) <= length:
        return value
    return f"{value[: length - 3]}..."
