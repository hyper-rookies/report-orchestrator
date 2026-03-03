from __future__ import annotations

import time
from typing import Any

import boto3
from policy_guard import QueryError


def run_query(
    sql: str,
    workgroup: str,
    database: str,
    output_location: str,
    timeout_seconds: int,
    max_rows: int,
    poll_interval_ms: int = 500,
) -> tuple[str, dict[str, Any]]:
    """
    Executes SQL against Athena. Returns (query_execution_id, merged_result_set).

    merged_result_set has the same shape as a single GetQueryResults["ResultSet"],
    but with: (1) header row stripped from Rows, (2) all pages merged.

    Raises QueryError:
    - QUERY_TIMEOUT if timeout_seconds is exceeded before SUCCEEDED
    - ATHENA_FAILED if Athena returns FAILED or CANCELLED
    """
    client = boto3.client("athena")
    poll_secs = max(poll_interval_ms / 1000.0, 0.2)

    start_resp = client.start_query_execution(
        QueryString=sql,
        QueryExecutionContext={"Database": database},
        ResultConfiguration={"OutputLocation": output_location},
        WorkGroup=workgroup,
    )
    query_execution_id: str = start_resp["QueryExecutionId"]

    deadline = time.monotonic() + timeout_seconds
    while True:
        if time.monotonic() > deadline:
            raise QueryError(
                "QUERY_TIMEOUT",
                f"Athena query exceeded {timeout_seconds}s timeout.",
            )
        exec_resp = client.get_query_execution(QueryExecutionId=query_execution_id)
        state: str = exec_resp["QueryExecution"]["Status"]["State"]

        if state == "SUCCEEDED":
            break
        if state in ("FAILED", "CANCELLED"):
            reason = exec_resp["QueryExecution"]["Status"].get("StateChangeReason", "")
            raise QueryError(
                "ATHENA_FAILED",
                f"Athena query {state.lower()}: {reason}",
            )
        time.sleep(poll_secs)

    result_set = _fetch_result_set(client, query_execution_id, max_rows)
    return query_execution_id, result_set


def _fetch_result_set(
    client: Any,
    query_execution_id: str,
    max_rows: int,
) -> dict[str, Any]:
    """
    Paginates GetQueryResults until max_rows+1 data rows are fetched
    (the extra row lets map_result_set detect truncation accurately).
    Returns a merged ResultSet dict with the header row already stripped.
    """
    column_info: list[dict] = []
    all_data_rows: list[dict] = []
    next_token: str | None = None
    first_page = True

    # Fetch until we have more than max_rows (to detect truncation) or no more pages
    while len(all_data_rows) <= max_rows:
        kwargs: dict[str, Any] = {
            "QueryExecutionId": query_execution_id,
            "MaxResults": 1000,  # Athena max per page
        }
        if next_token:
            kwargs["NextToken"] = next_token

        page = client.get_query_results(**kwargs)
        page_result_set = page["ResultSet"]

        if first_page:
            column_info = page_result_set["ResultSetMetadata"]["ColumnInfo"]
            rows = page_result_set["Rows"][1:]  # skip header row
            first_page = False
        else:
            rows = page_result_set["Rows"]

        all_data_rows.extend(rows)
        next_token = page.get("NextToken")
        if not next_token:
            break

    return {
        "ResultSetMetadata": {"ColumnInfo": column_info},
        "Rows": all_data_rows,
    }
