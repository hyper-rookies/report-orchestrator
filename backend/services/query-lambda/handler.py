from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import sys

SERVICE_DIR = Path(__file__).resolve().parent
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from policy_guard import QueryError, validate_build_sql_payload  # noqa: E402
from sql_builder import build_sql  # noqa: E402

VERSION = "v1"


def lambda_handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    try:
        payload = _parse_event_payload(event)
        validated_payload = validate_build_sql_payload(payload)
        result = {
            "version": VERSION,
            "sql": build_sql(validated_payload),
        }
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
        result = {
            "version": VERSION,
            "error": {
                "code": "UNKNOWN",
                "message": "Unexpected query-lambda error.",
                "retryable": False,
                "actionGroup": "query",
            },
        }

    return {"statusCode": 200, "body": json.dumps(result)}


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
