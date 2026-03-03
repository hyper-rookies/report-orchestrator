from __future__ import annotations

import json
import logging
import os
import uuid
from typing import Any

from policy_guard import QueryError, validate_build_sql_payload
from sql_builder import build_sql

VERSION = "v1"
logger = logging.getLogger(__name__)

_ALLOWED_OPERATIONS = frozenset({"buildSQL", "executeAthenaQuery"})


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    try:
        payload = _parse_event_payload(event)
        operation = _route_operation(payload)
        if operation == "buildSQL":
            validated = validate_build_sql_payload(payload)
            result = {"version": VERSION, "sql": build_sql(validated)}
        else:
            result = _handle_execute_athena_query(payload)
    except QueryError as exc:
        result = {
            "version": VERSION,
            "error": {
                "code": exc.code,
                "message": exc.message,
                "retryable": False,
                "actionGroup": "query",
            },
        }
    except Exception:
        debug_id = getattr(context, "aws_request_id", None) or str(uuid.uuid4())
        logger.exception("Unexpected error in query-lambda [debugId=%s]", debug_id)
        result = {
            "version": VERSION,
            "error": {
                "code": "UNKNOWN",
                "message": "Unexpected query-lambda error.",
                "retryable": False,
                "actionGroup": "query",
                "debugId": debug_id,
            },
        }

    return {"statusCode": 200, "body": json.dumps(result)}


def _route_operation(payload: dict[str, Any]) -> str:
    """
    Determines which operation to invoke.

    Priority:
    1. Explicit 'operation' field → validated against _ALLOWED_OPERATIONS.
    2. Implicit backward-compat: 'view' present, 'sql' absent → 'buildSQL'.
    3. Implicit backward-compat: 'sql' present, 'view' absent → 'executeAthenaQuery'.
    4. All other cases (ambiguous, missing discriminator) → INVALID_OPERATION.

    The implicit paths exist only for backward compatibility with callers that
    do not yet send an 'operation' field. New callers MUST use explicit operation.
    """
    op = payload.get("operation")

    if op is not None:
        if op not in _ALLOWED_OPERATIONS:
            raise QueryError(
                "INVALID_OPERATION",
                f"Unknown operation '{op}'. Allowed: buildSQL, executeAthenaQuery.",
            )
        return op

    # Backward-compatible implicit routing — one discriminating key only
    has_view = "view" in payload
    has_sql = "sql" in payload

    if has_view and not has_sql:
        return "buildSQL"
    if has_sql and not has_view:
        return "executeAthenaQuery"

    raise QueryError(
        "INVALID_OPERATION",
        "Cannot determine operation. Set 'operation' to 'buildSQL' or 'executeAthenaQuery'.",
    )


def _handle_execute_athena_query(payload: dict[str, Any]) -> dict[str, Any]:
    # Lazy imports: athena_runner imports boto3; only load when actually needed.
    from athena_runner import run_query
    from row_mapper import map_result_set

    sql = payload.get("sql")
    if not isinstance(sql, str) or not sql.strip():
        raise QueryError("UNKNOWN", "sql is required and must be a non-empty string.")

    timeout_seconds = payload.get("timeoutSeconds")
    if not isinstance(timeout_seconds, int) or timeout_seconds <= 0:
        raise QueryError("UNKNOWN", "timeoutSeconds must be a positive integer.")

    max_rows = payload.get("maxRows")
    if not isinstance(max_rows, int) or not (1 <= max_rows <= 10000):
        raise QueryError("UNKNOWN", "maxRows must be an integer between 1 and 10000.")

    poll_interval_ms = payload.get("pollIntervalMs", 500)
    if not isinstance(poll_interval_ms, int) or poll_interval_ms < 200:
        poll_interval_ms = 500

    workgroup = payload.get("workgroup") or os.environ.get("ATHENA_WORKGROUP")
    database = payload.get("database") or os.environ.get("ATHENA_DATABASE")
    output_location = payload.get("outputLocation") or os.environ.get("ATHENA_OUTPUT_LOCATION")

    if not workgroup or not database or not output_location:
        raise QueryError(
            "UNKNOWN",
            "Athena workgroup, database, and outputLocation are required "
            "(set in request or env ATHENA_WORKGROUP / ATHENA_DATABASE / ATHENA_OUTPUT_LOCATION).",
        )

    qid, result_set = run_query(
        sql=sql,
        workgroup=workgroup,
        database=database,
        output_location=output_location,
        timeout_seconds=timeout_seconds,
        max_rows=max_rows,
        poll_interval_ms=poll_interval_ms,
    )
    rows, truncated = map_result_set(result_set, max_rows)

    return {
        "version": VERSION,
        "rows": rows,
        "rowCount": len(rows),
        "truncated": truncated,
        "queryExecutionId": qid,
    }


def _parse_event_payload(event: Any) -> dict[str, Any]:
    if not isinstance(event, dict):
        return {}

    body = event.get("body")
    if isinstance(body, str):
        payload = json.loads(body)
        if not isinstance(payload, dict):
            raise ValueError("Request body must decode to an object.")
        return payload
    if isinstance(body, dict):
        return body

    return event
