from __future__ import annotations

import gzip
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Callable

import boto3
from botocore.exceptions import ClientError

from mock_generators.appsflyer import (
    generate_appsflyer_events,
    generate_appsflyer_installs,
)
from mock_generators.cohort import generate_appsflyer_cohort
from mock_generators.ga4 import generate_ga4_acquisition, generate_ga4_engagement


DATABASE_NAME = "hyper_intern_m1c"

# Glue LOCATION이 기본 raw/{name}/ 패턴과 다른 데이터셋의 S3 prefix 재정의
S3_PREFIX_OVERRIDES: dict[str, str] = {
    "appsflyer_cohort_daily": "raw/source=appsflyer/report=appsflyer_cohort_daily",
}


def _s3_prefix(dataset_name: str) -> str:
    return S3_PREFIX_OVERRIDES.get(dataset_name, f"raw/{dataset_name}")


def _to_jsonl_gz(rows: list[dict]) -> bytes:
    payload = "\n".join(json.dumps(row, ensure_ascii=False) for row in rows).encode("utf-8")
    return gzip.compress(payload)


def _upload_dataset(
    s3_client,
    bucket: str,
    dataset_name: str,
    target_date: str,
    rows: list[dict],
) -> str:
    key = f"{_s3_prefix(dataset_name)}/dt={target_date}/data.jsonl.gz"
    s3_client.put_object(
        Bucket=bucket,
        Key=key,
        Body=_to_jsonl_gz(rows),
        ContentType="application/gzip",
    )
    return key


def _register_partition(
    glue_client,
    dataset_name: str,
    bucket: str,
    target_date: str,
) -> None:
    location = f"s3://{bucket}/{_s3_prefix(dataset_name)}/dt={target_date}/"
    try:
        glue_client.batch_create_partition(
            DatabaseName=DATABASE_NAME,
            TableName=dataset_name,
            PartitionInputList=[
                {
                    "Values": [target_date],
                    "StorageDescriptor": {
                        "Location": location,
                    },
                }
            ],
        )
    except ClientError as e:
        if e.response["Error"]["Code"] != "AlreadyExistsException":
            raise


def _parse_target_date(event: dict) -> str:
    """SQS Event Source Mapping 및 EventBridge 직접 호출 모두 처리."""
    if "Records" in event:
        # SQS Event Source Mapping: {"Records": [{"body": "{\"target_date\": \"...\"}"}]}
        body = json.loads(event["Records"][0]["body"])
        raw = body.get("target_date")
    else:
        # EventBridge 직접 호출 또는 로컬 수동 테스트
        raw = event.get("target_date")
    return raw or (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()


def lambda_handler(event, context):  # noqa: ARG001
    target_date = _parse_target_date(event)

    data_bucket = os.environ["DATA_BUCKET"]

    s3_client = boto3.client("s3")
    glue_client = boto3.client("glue")

    generators: dict[str, Callable[[str], list[dict]]] = {
        "ga4_acquisition_daily": generate_ga4_acquisition,
        "ga4_engagement_daily": generate_ga4_engagement,
        "appsflyer_installs_daily": generate_appsflyer_installs,
        "appsflyer_events_daily": generate_appsflyer_events,
        "appsflyer_cohort_daily": generate_appsflyer_cohort,
    }

    datasets: list[str] = []
    for dataset_name, generator in generators.items():
        rows = generator(target_date)
        _upload_dataset(
            s3_client=s3_client,
            bucket=data_bucket,
            dataset_name=dataset_name,
            target_date=target_date,
            rows=rows,
        )
        _register_partition(
            glue_client=glue_client,
            dataset_name=dataset_name,
            bucket=data_bucket,
            target_date=target_date,
        )
        datasets.append(dataset_name)

    return {
        "statusCode": 200,
        "dates": [target_date],
        "datasets": datasets,
    }
