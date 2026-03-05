from __future__ import annotations

import json
import os
import time
import uuid
from datetime import date, timedelta

import boto3
from botocore.exceptions import ClientError

try:
    import jwt
except ModuleNotFoundError:  # pragma: no cover - local fallback for import-only checks
    jwt = None  # type: ignore[assignment]


DATABASE_NAME = os.environ.get("DATABASE_NAME", "hyper_intern_m1c")
DATA_BUCKET = os.environ.get("DATA_BUCKET", "")
ATHENA_OUTPUT = (
    f"s3://{DATA_BUCKET}/athena-report-output/"
    if DATA_BUCKET
    else "s3://placeholder-bucket/athena-report-output/"
)
DDB_TABLE = os.environ.get("DDB_TABLE", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "")
APP_URL = os.environ.get("APP_URL", "http://localhost:3000")
JWT_EXPIRY_DAYS = 30


def _require_runtime_config() -> None:
    if not DATA_BUCKET:
        raise RuntimeError("Missing required env var: DATA_BUCKET")
    if not DDB_TABLE:
        raise RuntimeError("Missing required env var: DDB_TABLE")
    if not JWT_SECRET:
        raise RuntimeError("Missing required env var: JWT_SECRET")
    if jwt is None:
        raise RuntimeError("Missing dependency: PyJWT")


def _run_athena(athena, sql: str) -> list[dict]:
    resp = athena.start_query_execution(
        QueryString=sql,
        QueryExecutionContext={"Database": DATABASE_NAME},
        ResultConfiguration={"OutputLocation": ATHENA_OUTPUT},
    )
    qid = resp["QueryExecutionId"]

    for _ in range(60):
        status = athena.get_query_execution(QueryExecutionId=qid)
        state = status["QueryExecution"]["Status"]["State"]
        if state == "SUCCEEDED":
            break
        if state in ("FAILED", "CANCELLED"):
            reason = status["QueryExecution"]["Status"].get("StateChangeReason", "")
            raise RuntimeError(f"Athena query failed: {reason}")
        time.sleep(1)
    else:
        raise TimeoutError("Athena query timed out")

    results = athena.get_query_results(QueryExecutionId=qid)
    rows = results["ResultSet"]["Rows"]
    if len(rows) < 2:
        return []
    headers = [c["VarCharValue"] for c in rows[0]["Data"]]
    return [
        {headers[i]: col.get("VarCharValue", "") for i, col in enumerate(row["Data"])}
        for row in rows[1:]
    ]


REPORT_QUERIES = [
    {
        "title": "채널별 세션 요약 (11월)",
        "sql": (
            "SELECT channel_group, SUM(sessions) AS total_sessions, "
            "SUM(total_users) AS total_users "
            "FROM v_latest_ga4_acquisition_daily "
            "WHERE dt BETWEEN '2024-11-01' AND '2024-11-30' "
            "GROUP BY channel_group ORDER BY total_sessions DESC"
        ),
    },
    {
        "title": "미디어 소스별 설치 건수 (11월)",
        "sql": (
            "SELECT media_source, SUM(installs) AS total_installs "
            "FROM v_latest_appsflyer_installs_daily "
            "WHERE dt BETWEEN '2024-11-01' AND '2024-11-30' "
            "GROUP BY media_source ORDER BY total_installs DESC"
        ),
    },
    {
        "title": "미디어 소스별 구매 매출 (11월)",
        "sql": (
            "SELECT media_source, SUM(event_revenue) AS total_revenue "
            "FROM v_latest_appsflyer_events_daily "
            "WHERE dt BETWEEN '2024-11-01' AND '2024-11-30' "
            "AND event_name = 'purchase' "
            "GROUP BY media_source ORDER BY total_revenue DESC"
        ),
    },
]


def _generate_weekly_report() -> dict:
    _require_runtime_config()
    athena = boto3.client("athena")
    ddb = boto3.resource("dynamodb").Table(DDB_TABLE)

    sections = []
    for q in REPORT_QUERIES:
        try:
            rows = _run_athena(athena, q["sql"])
        except Exception as e:  # pragma: no cover - external service failure path
            rows = []
            print(f"[WARN] Query failed for '{q['title']}': {e}")
        sections.append({"title": q["title"], "rows": rows})

    report_id = str(uuid.uuid4())
    created_at = int(time.time())
    expires_at = created_at + JWT_EXPIRY_DAYS * 86400
    week_str = (date.today() - timedelta(days=date.today().weekday())).isoformat()

    item = {
        "report_id": report_id,
        "title": f"주간 마케팅 리포트 ({week_str})",
        "created_at": created_at,
        "expires_at": expires_at,
        "sections": json.dumps(sections, ensure_ascii=False),
    }
    ddb.put_item(Item=item)

    token = jwt.encode(  # type: ignore[union-attr]
        {"report_id": report_id, "exp": expires_at},
        JWT_SECRET,
        algorithm="HS256",
    )
    share_url = f"{APP_URL}/shared/{token}"
    return {"report_id": report_id, "url": share_url, "title": item["title"]}


def _get_report(token: str) -> dict:
    _require_runtime_config()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])  # type: ignore[union-attr]
    except jwt.ExpiredSignatureError:  # type: ignore[union-attr]
        return {"error": "링크가 만료되었습니다."}
    except jwt.InvalidTokenError:  # type: ignore[union-attr]
        return {"error": "유효하지 않은 링크입니다."}

    ddb = boto3.resource("dynamodb").Table(DDB_TABLE)
    try:
        resp = ddb.get_item(Key={"report_id": payload["report_id"]})
    except ClientError as e:
        return {"error": str(e)}

    item = resp.get("Item")
    if not item:
        return {"error": "리포트를 찾을 수 없습니다."}

    return {
        "report_id": item["report_id"],
        "title": item["title"],
        "created_at": item["created_at"],
        "sections": json.loads(item["sections"]),
    }


def lambda_handler(event, context):  # noqa: ARG001
    if event.get("requestContext", {}).get("http", {}).get("method") == "GET":
        query = event.get("queryStringParameters") or {}
        token = query.get("token", "")
        report = _get_report(token)
        status = 200 if "error" not in report else 400
        return {
            "statusCode": status,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps(report, ensure_ascii=False),
        }

    result = _generate_weekly_report()
    return {"statusCode": 200, **result}

