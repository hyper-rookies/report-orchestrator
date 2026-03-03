from __future__ import annotations

import json
from typing import Any

VERSION = "v1"
ALLOWED_CHART_TYPES = {"bar", "line", "table"}


class VizError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def lambda_handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    try:
        payload = event if isinstance(event, dict) else {}
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

    return {"statusCode": 200, "body": json.dumps(result)}


def build_chart_spec(payload: dict[str, Any]) -> dict[str, Any]:
    rows = payload.get("rows")
    chart_type = payload.get("chartType")
    title = payload.get("title")
    x_axis = payload.get("xAxis")
    y_axis = payload.get("yAxis")

    if payload.get("version") != VERSION:
        raise VizError("UNKNOWN", "Unsupported version.")
    if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
        raise VizError("UNKNOWN", "rows must be an array of objects.")
    if chart_type not in ALLOWED_CHART_TYPES:
        raise VizError("INVALID_CHART_TYPE", "chartType must be one of bar, line, or table.")

    spec: dict[str, Any] = {
        "type": chart_type,
        "data": list(rows),
    }
    if isinstance(title, str):
        spec["title"] = title

    if chart_type == "table":
        return {"version": VERSION, "spec": spec}

    if not isinstance(x_axis, str) or not x_axis:
        raise VizError("MISSING_AXIS", "xAxis is required for bar and line charts.")
    if not isinstance(y_axis, list) or not y_axis or not all(
        isinstance(metric, str) and metric for metric in y_axis
    ):
        raise VizError("MISSING_AXIS", "yAxis must be a non-empty string array for bar and line charts.")

    spec["xAxis"] = x_axis
    spec["series"] = [{"metric": metric, "label": _build_label(metric)} for metric in y_axis]
    return {"version": VERSION, "spec": spec}


def _build_label(metric: str) -> str:
    return metric.replace("_", " ").title()
