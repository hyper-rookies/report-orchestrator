from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from policy_guard import QueryError, validate_build_sql_payload
from sql_builder import build_sql

VERSION = "v1"
logger = logging.getLogger(__name__)


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
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
