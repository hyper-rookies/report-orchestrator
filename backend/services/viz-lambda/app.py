from __future__ import annotations

import json
from typing import Any

VERSION = "v1"
ALLOWED_CHART_TYPES = {"bar", "line", "table", "pie", "stackedBar"}

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


class VizError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def lambda_handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    bedrock = _is_bedrock_event(event)
    try:
        payload = _parse_bedrock_params(event) if bedrock else _parse_event_payload(event)
        result = build_chart_spec(payload)
    except VizError as exc:
        result = {
            "version": VERSION,
            "error": {
                "code": exc.code,
                "message": exc.message,
                "retryable": False,
                "actionGroup": "viz",
            },
        }
    except Exception:
        result = {
            "version": VERSION,
            "error": {
                "code": "UNKNOWN",
                "message": "Unexpected viz-lambda error.",
                "retryable": False,
                "actionGroup": "viz",
            },
        }

    if bedrock:
        return _format_bedrock_response(event, result)
    return {"statusCode": 200, "body": json.dumps(result)}


def build_chart_spec(payload: dict[str, Any]) -> dict[str, Any]:
    rows = payload.get("rows")
    chart_type = payload.get("chartType")
    title = payload.get("title")
    x_axis = payload.get("xAxis")
    y_axis = payload.get("yAxis")

    version = payload.get("version", VERSION)
    if version != VERSION:
        raise VizError("UNKNOWN", "Unsupported version.")
    if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
        raise VizError("UNKNOWN", "rows must be an array of objects.")
    if chart_type not in ALLOWED_CHART_TYPES:
        raise VizError("INVALID_CHART_TYPE", "chartType must be one of bar, line, table, pie, or stackedBar.")

    spec: dict[str, Any] = {
        "type": chart_type,
        "data": list(rows),
    }
    if isinstance(title, str):
        spec["title"] = title

    if chart_type == "table":
        return {"version": VERSION, "spec": spec}

    if chart_type == "pie":
        if not isinstance(x_axis, str) or not x_axis.strip():
            raise VizError("MISSING_AXIS", "xAxis is required for pie charts.")
        if not isinstance(y_axis, list) or not y_axis or not all(
            isinstance(metric, str) and metric.strip() for metric in y_axis
        ):
            raise VizError("MISSING_AXIS", "yAxis must be a non-empty string array for pie charts.")
        spec["nameKey"] = x_axis
        spec["valueKey"] = y_axis[0]
        return {"version": VERSION, "spec": spec}

    if not isinstance(x_axis, str) or not x_axis.strip():
        raise VizError("MISSING_AXIS", "xAxis is required for bar, line, and stackedBar charts.")
    if not isinstance(y_axis, list) or not y_axis or not all(
        isinstance(metric, str) and metric.strip() for metric in y_axis
    ):
        raise VizError("MISSING_AXIS", "yAxis must be a non-empty string array for bar, line, and stackedBar charts.")

    spec["xAxis"] = x_axis
    spec["series"] = [{"metric": metric, "label": _build_label(metric)} for metric in y_axis]
    return {"version": VERSION, "spec": spec}


def _parse_event_payload(event: Any) -> dict[str, Any]:
    if not isinstance(event, dict):
        return {}

    body = event.get("body")
    if isinstance(body, str):
        payload = json.loads(body)
        if not isinstance(payload, dict):
            raise ValueError("Request body must decode to an object.")
        return payload

    return event


def _build_label(metric: str) -> str:
    return metric.replace("_", " ").title()
