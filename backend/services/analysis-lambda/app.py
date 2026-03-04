from __future__ import annotations

import json
import math
from typing import Any

VERSION = "v1"

# ── Bedrock Action Group adapter ──────────────────────────────────────────────

_BEDROCK_TYPE_PARSERS = {
    "array": json.loads,
    "object": json.loads,
    "integer": int,
    "number": float,
    "boolean": lambda v: v.lower() == "true",
}


def _is_bedrock_event(event: Any) -> bool:
    return isinstance(event, dict) and "actionGroup" in event and "function" in event


def _parse_bedrock_params(event: dict[str, Any]) -> dict[str, Any]:
    params: dict[str, Any] = {}
    for p in event.get("parameters", []):
        parser = _BEDROCK_TYPE_PARSERS.get(p.get("type", "string"), lambda v: v)
        params[p["name"]] = parser(p["value"])
    # Inject version so the agent doesn't need to include it as a parameter
    params.setdefault("version", VERSION)
    return params


def _format_bedrock_response(event: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    return {
        "messageVersion": "1.0",
        "response": {
            "actionGroup": event["actionGroup"],
            "function": event["function"],
            "functionResponse": {
                "responseBody": {"TEXT": {"body": json.dumps(result)}},
            },
        },
    }


# ─────────────────────────────────────────────────────────────────────────────


class AnalysisError(Exception):
    def __init__(self, code: str, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def lambda_handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    bedrock = _is_bedrock_event(event)
    status_code = 200
    try:
        payload = _parse_bedrock_params(event) if bedrock else (event if isinstance(event, dict) else {})
        result = compute_delta(payload)
    except AnalysisError as exc:
        status_code = exc.status_code
        result = {
            "version": VERSION,
            "error": {
                "code": exc.code,
                "message": exc.message,
                "retryable": False,
                "actionGroup": "analysis",
            },
        }

    if bedrock:
        return _format_bedrock_response(event, result)
    return {"statusCode": status_code, "body": json.dumps(result)}


def compute_delta(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("version") != VERSION:
        raise AnalysisError("UNKNOWN", "Unsupported version.", status_code=400)

    baseline_rows = _require_rows(payload.get("baseline"))
    comparison_rows = _require_rows(payload.get("comparison"))
    group_by = _require_string_list(payload.get("groupBy"), "groupBy")
    metrics = _require_string_list(payload.get("metrics"), "metrics")

    baseline_index, baseline_order = _index_rows(baseline_rows, group_by)
    comparison_index, comparison_order = _index_rows(comparison_rows, group_by)

    deltas: list[dict[str, Any]] = []
    seen_keys: set[tuple[Any, ...]] = set()

    for key_values in baseline_order + comparison_order:
        if key_values in seen_keys:
            continue
        seen_keys.add(key_values)
        deltas.append(
            _build_delta_row(
                key_values=key_values,
                group_by=group_by,
                metrics=metrics,
                baseline_row=baseline_index.get(key_values),
                comparison_row=comparison_index.get(key_values),
            )
        )

    return {"version": VERSION, "deltas": deltas}


def _require_rows(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        raise AnalysisError("UNKNOWN", "Rows must be provided as arrays.", status_code=400)
    if not all(isinstance(row, dict) for row in value):
        raise AnalysisError("UNKNOWN", "Rows must contain objects.", status_code=400)
    return value


def _require_string_list(value: Any, field_name: str) -> list[str]:
    if not isinstance(value, list) or not value or not all(
        isinstance(item, str) and item for item in value
    ):
        raise AnalysisError("UNKNOWN", f"{field_name} must be a non-empty string array.", status_code=400)
    return value


def _index_rows(
    rows: list[dict[str, Any]],
    group_by: list[str],
) -> tuple[dict[tuple[Any, ...], dict[str, Any]], list[tuple[Any, ...]]]:
    index: dict[tuple[Any, ...], dict[str, Any]] = {}
    order: list[tuple[Any, ...]] = []

    for row in rows:
        missing_columns = [column for column in group_by if column not in row]
        if missing_columns:
            missing = ", ".join(missing_columns)
            raise AnalysisError(
                "ALIGNMENT_ERROR",
                f"Missing groupBy column(s): {missing}",
            )

        key_values = tuple(row[column] for column in group_by)
        if key_values not in index:
            order.append(key_values)
        index[key_values] = row

    return index, order


def _build_delta_row(
    *,
    key_values: tuple[Any, ...],
    group_by: list[str],
    metrics: list[str],
    baseline_row: dict[str, Any] | None,
    comparison_row: dict[str, Any] | None,
) -> dict[str, Any]:
    baseline_metrics = _extract_metrics(baseline_row, metrics)
    comparison_metrics = _extract_metrics(comparison_row, metrics)

    delta_metrics: dict[str, float | int | None] = {}
    pct_change_metrics: dict[str, float | None] = {}

    for metric in metrics:
        baseline_value = baseline_metrics[metric]
        comparison_value = comparison_metrics[metric]

        if baseline_row is None or comparison_row is None:
            delta_metrics[metric] = None
            pct_change_metrics[metric] = None
            continue

        if baseline_value is None or comparison_value is None:
            delta_metrics[metric] = None
            pct_change_metrics[metric] = None
            continue

        delta_value = comparison_value - baseline_value
        delta_metrics[metric] = delta_value
        if baseline_value == 0:
            pct_change_metrics[metric] = None
        else:
            pct_change_metrics[metric] = delta_value / baseline_value

    return {
        "key": dict(zip(group_by, key_values, strict=True)),
        "baseline": baseline_metrics,
        "comparison": comparison_metrics,
        "delta": delta_metrics,
        "pctChange": pct_change_metrics,
    }


def _extract_metrics(
    row: dict[str, Any] | None,
    metrics: list[str],
) -> dict[str, float | int | None]:
    values: dict[str, float | int | None] = {}
    for metric in metrics:
        raw_value = None if row is None else row.get(metric)
        values[metric] = _coerce_metric_value(metric, raw_value)
    return values


def _coerce_metric_value(metric: str, value: Any) -> float | int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        raise AnalysisError(
            "INVALID_METRIC_VALUE",
            f"Metric '{metric}' must be numeric.",
        )
    if isinstance(value, (int, float)):
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            raise AnalysisError(
                "INVALID_METRIC_VALUE",
                f"Metric '{metric}' must be numeric.",
            )
        return value
    if isinstance(value, str):
        try:
            parsed = float(value)
        except ValueError as exc:
            raise AnalysisError(
                "INVALID_METRIC_VALUE",
                f"Metric '{metric}' must be numeric.",
            ) from exc
        if math.isnan(parsed) or math.isinf(parsed):
            raise AnalysisError(
                "INVALID_METRIC_VALUE",
                f"Metric '{metric}' must be numeric.",
            )
        return parsed
    raise AnalysisError(
        "INVALID_METRIC_VALUE",
        f"Metric '{metric}' must be numeric.",
    )
