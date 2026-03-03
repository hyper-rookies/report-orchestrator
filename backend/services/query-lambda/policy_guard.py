from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

VERSION = "v1"
DEFAULT_LIMIT = 1000
MAX_LIMIT = 10000
DATABASE_NAME = "hyper_intern_m1c"
ALLOWED_FILTER_OPS = {"=", "!=", ">", "<", ">=", "<=", "LIKE", "IN"}
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DML_PATTERN = re.compile(r"\b(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE|CREATE|ALTER)\b", re.IGNORECASE)


class QueryError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def validate_build_sql_payload(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise QueryError("UNKNOWN", "Request payload must be an object.")
    if payload.get("version") != VERSION:
        raise QueryError("UNKNOWN", "Unsupported version.")

    _reject_dml_tokens(payload)

    policy = _load_json("reporting_policy.json")
    catalog = _load_json("catalog_discovered.json")

    view = payload.get("view")
    if not isinstance(view, str) or not view:
        raise QueryError("SCHEMA_VIOLATION", "view is required.")

    allowed_views = set(policy["allowed_views"])
    datasets = catalog["datasets"]
    if view not in allowed_views or view not in datasets:
        raise QueryError("SCHEMA_VIOLATION", f"View '{view}' is not allowed.")

    date_range = payload.get("dateRange")
    if not isinstance(date_range, dict):
        raise QueryError("SCHEMA_VIOLATION", "dateRange is required.")
    start = date_range.get("start")
    end = date_range.get("end")
    if not isinstance(start, str) or not DATE_PATTERN.fullmatch(start):
        raise QueryError("SCHEMA_VIOLATION", "dateRange.start must match YYYY-MM-DD.")
    if not isinstance(end, str) or not DATE_PATTERN.fullmatch(end):
        raise QueryError("SCHEMA_VIOLATION", "dateRange.end must match YYYY-MM-DD.")
    if start > end:
        raise QueryError("SCHEMA_VIOLATION", "dateRange.start must be <= dateRange.end.")

    dataset_columns = {column["name"] for column in datasets[view]["columns"]}
    denied_columns = set(policy["denied_columns_global"]["columns"])
    allowed_dimensions = set(policy["dimensions"][view]["allowed"])
    allowed_metrics = set(policy["metrics"][view]["allowed"])

    dimensions = _validate_selected_columns(
        payload.get("dimensions"),
        "dimensions",
        allowed_dimensions,
        dataset_columns,
        denied_columns,
    )
    metrics = _validate_selected_columns(
        payload.get("metrics"),
        "metrics",
        allowed_metrics,
        dataset_columns,
        denied_columns,
    )
    filters = _validate_filters(payload.get("filters"), dataset_columns, denied_columns)
    limit = _normalize_limit(payload.get("limit"))

    return {
        "version": VERSION,
        "database": DATABASE_NAME,
        "view": view,
        "dateRange": {"start": start, "end": end},
        "dimensions": dimensions,
        "metrics": metrics,
        "filters": filters,
        "limit": limit,
    }


def _validate_selected_columns(
    value: Any,
    field_name: str,
    allowed_columns: set[str],
    dataset_columns: set[str],
    denied_columns: set[str],
) -> list[str]:
    if not isinstance(value, list) or not value:
        raise QueryError("SCHEMA_VIOLATION", f"{field_name} must be a non-empty string array.")

    normalized: list[str] = []
    for column in value:
        if not isinstance(column, str) or not column:
            raise QueryError("SCHEMA_VIOLATION", f"{field_name} must contain only strings.")
        if column in denied_columns:
            raise QueryError("SCHEMA_VIOLATION", f"Column '{column}' is denied.")
        if column not in dataset_columns:
            raise QueryError("SCHEMA_VIOLATION", f"Column '{column}' is not in catalog_discovered.")
        if column not in allowed_columns:
            raise QueryError("SCHEMA_VIOLATION", f"Column '{column}' is not allowed for {field_name}.")
        normalized.append(column)
    return normalized


def _validate_filters(
    value: Any,
    dataset_columns: set[str],
    denied_columns: set[str],
) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise QueryError("SCHEMA_VIOLATION", "filters must be an array.")

    normalized: list[dict[str, Any]] = []
    for filter_item in value:
        if not isinstance(filter_item, dict):
            raise QueryError("SCHEMA_VIOLATION", "Each filter must be an object.")

        column = filter_item.get("column")
        op = filter_item.get("op")
        raw_value = filter_item.get("value")

        if not isinstance(column, str) or not column:
            raise QueryError("SCHEMA_VIOLATION", "filters[].column is required.")
        if column in denied_columns:
            raise QueryError("SCHEMA_VIOLATION", f"Column '{column}' is denied.")
        if column not in dataset_columns:
            raise QueryError("SCHEMA_VIOLATION", f"Column '{column}' is not in catalog_discovered.")
        if not isinstance(op, str) or op not in ALLOWED_FILTER_OPS:
            raise QueryError("SCHEMA_VIOLATION", f"Operator '{op}' is not allowed.")

        normalized.append({"column": column, "op": op, "value": _normalize_filter_value(column, op, raw_value)})
    return normalized


def _normalize_filter_value(column: str, op: str, value: Any) -> str | int | float | list[str]:
    if op == "IN":
        if (
            not isinstance(value, list)
            or not value
            or not all(isinstance(item, str) and item for item in value)
        ):
            raise QueryError("SCHEMA_VIOLATION", "IN filters require a non-empty string array.")
        return value

    if isinstance(value, bool):
        raise QueryError("SCHEMA_VIOLATION", f"Filter value for '{column}' must not be boolean.")
    if isinstance(value, (int, float, str)):
        return value
    raise QueryError("SCHEMA_VIOLATION", f"Filter value for '{column}' has an invalid type.")


def _normalize_limit(value: Any) -> int:
    if value is None:
        return DEFAULT_LIMIT
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise QueryError("SCHEMA_VIOLATION", "limit must be a positive integer.")
    # Chosen behavior: clamp instead of reject so generated SQL always satisfies the contract max.
    return min(value, MAX_LIMIT)


def _reject_dml_tokens(value: Any) -> None:
    if isinstance(value, dict):
        for nested_value in value.values():
            _reject_dml_tokens(nested_value)
        return
    if isinstance(value, list):
        for item in value:
            _reject_dml_tokens(item)
        return
    if isinstance(value, str) and DML_PATTERN.search(value):
        raise QueryError("DML_REJECTED", "DML keywords are not allowed in buildSQL input.")


def _load_json(filename: str) -> dict[str, Any]:
    shared_dir = Path(__file__).resolve().parents[1] / "report-orchestrator-lambda" / "src" / "shared"
    return json.loads((shared_dir / filename).read_text(encoding="utf-8"))
