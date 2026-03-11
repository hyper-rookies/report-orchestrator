from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

VERSION = "v1"
DEFAULT_LIMIT = 1000
MAX_LIMIT = 10000
DEFAULT_DATABASE_NAME = "hyper_intern_m1c"
ALLOWED_FILTER_OPS = {"=", "!=", ">", "<", ">=", "<=", "LIKE", "IN"}
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DML_PATTERN = re.compile(r"\b(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE|CREATE|ALTER)\b", re.IGNORECASE)
COMMENT_PATTERN = re.compile(r"--|/\*|\*/")
FORBIDDEN_EXECUTE_SQL_PATTERN = re.compile(
    r"\b(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE|CREATE|ALTER|MERGE|UNLOAD|MSCK|CALL|GRANT|REVOKE|SET|RESET|USE|SHOW|DESCRIBE)\b",
    re.IGNORECASE,
)
ADVANCED_QUERY_PATTERN = re.compile(r"\b(?:WITH|JOIN|UNION|INTERSECT|EXCEPT)\b", re.IGNORECASE)
SUPPORTED_EXECUTE_SQL_PATTERN = re.compile(
    r"^\s*SELECT\s+.+\s+FROM\s+(?P<database>[A-Za-z_][A-Za-z0-9_]*)\.(?P<view>[A-Za-z_][A-Za-z0-9_]*)\s+"
    r"WHERE\s+.+\s+GROUP\s+BY\s+[\d,\s]+\s+ORDER\s+BY\s+[A-Za-z_][A-Za-z0-9_]*\s+DESC\s+LIMIT\s+(?P<limit>\d+)\s*$",
    re.IGNORECASE | re.DOTALL,
)
AGGREGATE_METRIC_PATTERN = re.compile(
    r"^(?P<func>SUM|AVG|MIN|MAX|COUNT)\s*\(\s*(?P<column>[A-Za-z_][A-Za-z0-9_]*)\s*\)"
    r"(?:\s+AS\s+[A-Za-z_][A-Za-z0-9_]*)?$",
    re.IGNORECASE,
)
SHARED_DIR = Path(__file__).resolve().parent


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
        "database": _database_name(),
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

        normalized_column = (
            _normalize_metric_column(column) if field_name == "metrics" else column
        )

        if normalized_column in denied_columns:
            raise QueryError("SCHEMA_VIOLATION", f"Column '{normalized_column}' is denied.")
        if normalized_column not in dataset_columns:
            raise QueryError(
                "SCHEMA_VIOLATION",
                f"Column '{normalized_column}' is not in catalog_discovered.",
            )
        if normalized_column not in allowed_columns:
            raise QueryError(
                "SCHEMA_VIOLATION",
                f"Column '{normalized_column}' is not allowed for {field_name}.",
            )
        normalized.append(normalized_column)
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
    try:
        return json.loads((SHARED_DIR / filename).read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise QueryError("UNKNOWN", f"Configuration file '{filename}' is missing.")
    except json.JSONDecodeError:
        raise QueryError("UNKNOWN", f"Configuration file '{filename}' is invalid JSON.")


def _normalize_metric_column(metric: str) -> str:
    match = AGGREGATE_METRIC_PATTERN.match(metric.strip())
    if match:
        return match.group("column")
    return metric


def validate_execute_sql(sql: str) -> str:
    if not isinstance(sql, str) or not sql.strip():
        raise QueryError("SCHEMA_VIOLATION", "sql is required and must be a non-empty string.")

    stripped = sql.strip()
    normalized = _strip_sql_string_literals(stripped)

    if ";" in normalized:
        raise QueryError("SCHEMA_VIOLATION", "Only a single SQL statement is allowed.")
    if COMMENT_PATTERN.search(normalized):
        raise QueryError("SCHEMA_VIOLATION", "SQL comments are not allowed.")
    if FORBIDDEN_EXECUTE_SQL_PATTERN.search(normalized):
        raise QueryError("SCHEMA_VIOLATION", "Only read-only SELECT queries are allowed.")
    if ADVANCED_QUERY_PATTERN.search(normalized):
        raise QueryError("SCHEMA_VIOLATION", "JOIN, UNION, WITH, INTERSECT, and EXCEPT are not allowed.")
    if len(re.findall(r"\bSELECT\b", normalized, re.IGNORECASE)) != 1:
        raise QueryError("SCHEMA_VIOLATION", "Subqueries are not allowed in executeAthenaQuery.")
    if len(re.findall(r"\bFROM\b", normalized, re.IGNORECASE)) != 1:
        raise QueryError("SCHEMA_VIOLATION", "Only a single dataset is allowed in executeAthenaQuery.")
    if re.search(r"\b(?:run_id|_run_rank)\b", normalized, re.IGNORECASE):
        raise QueryError("SCHEMA_VIOLATION", "Denied columns are not allowed in executeAthenaQuery.")
    if re.match(r"^\s*SELECT\s+\*", normalized, re.IGNORECASE | re.DOTALL):
        raise QueryError("SCHEMA_VIOLATION", "SELECT * is not allowed in executeAthenaQuery.")

    match = SUPPORTED_EXECUTE_SQL_PATTERN.match(normalized)
    if not match:
        raise QueryError(
            "SCHEMA_VIOLATION",
            "executeAthenaQuery only accepts buildSQL-compatible read-only SELECT queries.",
        )

    policy = _load_json("reporting_policy.json")
    catalog = _load_json("catalog_discovered.json")
    database = match.group("database")
    view = match.group("view")
    limit = int(match.group("limit"))

    if database != _database_name():
        raise QueryError("SCHEMA_VIOLATION", f"Database '{database}' is not allowed.")
    if view not in set(policy["allowed_views"]) or view not in catalog["datasets"]:
        raise QueryError("SCHEMA_VIOLATION", f"View '{view}' is not allowed.")
    if limit <= 0 or limit > MAX_LIMIT:
        raise QueryError("SCHEMA_VIOLATION", f"LIMIT must be between 1 and {MAX_LIMIT}.")

    return stripped


def _database_name() -> str:
    return os.environ.get("ATHENA_DATABASE") or DEFAULT_DATABASE_NAME


def _strip_sql_string_literals(sql: str) -> str:
    return re.sub(r"'(?:''|[^'])*'", "''", sql)
