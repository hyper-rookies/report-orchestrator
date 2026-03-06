"""Athena CTAS helper: raw JSONL.GZ (on S3) → curated Parquet.

Flow for one dataset partition
-------------------------------
1. ``build_ctas_sql()``      → (SQL string, temp table name)
2. ``start_ctas_query()``    → query_execution_id
3. ``wait_query()``          → (state, athena_output_location, reason)
4. ``drop_ctas_table()``     → removes Glue Catalog entry (S3 data preserved)

Or use :meth:`AthenaCtasRunner.run` for the full flow in one call.

Prerequisites
-------------
- Raw JSONL.GZ already written at::

    s3://{bucket}/raw/source={source}/report={dataset_id}/dt={dt}/data.jsonl.gz

- Corresponding raw external table exists in Glue Catalog.
  Example DDL for ``ga4_acquisition_daily``::

    CREATE EXTERNAL TABLE {database}.raw_ga4_acquisition_daily (
        dimensions MAP<STRING, STRING>,
        metrics    MAP<STRING, STRING>
    )
    PARTITIONED BY (dt STRING)
    ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
    STORED AS TEXTFILE
    LOCATION 's3://{bucket}/raw/source=ga4/report=ga4_acquisition_daily/'
    TBLPROPERTIES ('ignore.malformed.json' = 'true');

  Run ``MSCK REPAIR TABLE {database}.raw_ga4_acquisition_daily;``
  once after creating the table to auto-load existing dt-partitions.
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


# ---------------------------------------------------------------------------
# Dataset registry
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CtasDatasetSpec:
    """Metadata for one curated dataset."""

    source: str     # 'ga4' | 'appsflyer'
    raw_table: str  # Athena external table name for the raw layer


REGISTRY: dict[str, CtasDatasetSpec] = {
    "ga4_acquisition_daily": CtasDatasetSpec(
        source="ga4",
        raw_table="raw_ga4_acquisition_daily",
    ),
    "ga4_engagement_daily": CtasDatasetSpec(
        source="ga4",
        raw_table="raw_ga4_engagement_daily",
    ),
    "appsflyer_installs_daily": CtasDatasetSpec(
        source="appsflyer",
        raw_table="raw_appsflyer_installs_daily",
    ),
    "appsflyer_events_daily": CtasDatasetSpec(
        source="appsflyer",
        raw_table="raw_appsflyer_events_daily",
    ),
    "appsflyer_cohort_daily": CtasDatasetSpec(
        source="appsflyer",
        raw_table="raw_appsflyer_cohort_daily",
    ),
}


# ---------------------------------------------------------------------------
# SELECT body registry  (placeholders: {database}, {raw_table}, {dt})
# ---------------------------------------------------------------------------

_SELECT_REGISTRY: dict[str, str] = {
    "ga4_acquisition_daily": """\
SELECT
  dimensions['sessionDefaultChannelGroup'] AS channel_group,
  dimensions['sessionSource']              AS source,
  dimensions['sessionMedium']              AS medium,
  TRY_CAST(metrics['sessions']     AS BIGINT) AS sessions,
  TRY_CAST(metrics['totalUsers']   AS BIGINT) AS total_users,
  TRY_CAST(metrics['conversions']  AS BIGINT) AS conversions,
  TRY_CAST(metrics['totalRevenue'] AS DOUBLE) AS total_revenue
FROM {database}.{raw_table}
WHERE dt = '{dt}'""",

    "ga4_engagement_daily": """\
SELECT
  dimensions['sessionDefaultChannelGroup'] AS channel_group,
  dimensions['sessionSource']              AS source,
  dimensions['sessionMedium']              AS medium,
  TRY_CAST(metrics['engagementRate'] AS DOUBLE) AS engagement_rate,
  TRY_CAST(metrics['bounceRate']     AS DOUBLE) AS bounce_rate
FROM {database}.{raw_table}
WHERE dt = '{dt}'""",

    # Raw event-level rows are stored (no Lambda aggregation).
    # CTAS performs COUNT(*) GROUP BY to produce the curated partition.
    "appsflyer_installs_daily": """\
SELECT
  dimensions['media_source']     AS media_source,
  dimensions['campaign']         AS campaign,
  dimensions['keyword']          AS keyword,
  dimensions['adset']            AS adset,
  dimensions['ad']               AS ad,
  dimensions['channel']          AS channel,
  dimensions['app_version']      AS app_version,
  dimensions['campaign_type']    AS campaign_type,
  dimensions['match_type']       AS match_type,
  dimensions['store_reinstall']  AS store_reinstall,
  COUNT(*)                       AS installs
FROM {database}.{raw_table}
WHERE dt = '{dt}'
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10""",

    # Raw event-level rows are stored (no Lambda aggregation).
    # CTAS performs COUNT(*) / SUM() GROUP BY to produce the curated partition.
    "appsflyer_events_daily": """\
SELECT
  dimensions['media_source']     AS media_source,
  dimensions['campaign']         AS campaign,
  dimensions['event_name']       AS event_name,
  dimensions['keyword']          AS keyword,
  dimensions['adset']            AS adset,
  dimensions['ad']               AS ad,
  dimensions['channel']          AS channel,
  dimensions['app_version']      AS app_version,
  dimensions['campaign_type']    AS campaign_type,
  dimensions['match_type']       AS match_type,
  dimensions['store_reinstall']  AS store_reinstall,
  COUNT(*)                                              AS event_count,
  SUM(TRY_CAST(metrics['event_revenue'] AS DOUBLE))    AS event_revenue
FROM {database}.{raw_table}
WHERE dt = '{dt}'
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11""",

    "appsflyer_cohort_daily": """\
SELECT
  dimensions['media_source'] AS media_source,
  dimensions['campaign']     AS campaign,
  dimensions['cohort_date']  AS cohort_date,
  TRY_CAST(dimensions['cohort_day']    AS BIGINT) AS cohort_day,
  TRY_CAST(metrics['retained_users']   AS BIGINT) AS retained_users,
  TRY_CAST(metrics['cohort_size']      AS BIGINT) AS cohort_size
FROM {database}.{raw_table}
WHERE dt = '{dt}'""",
}

# CTAS wrapper — {select_body} is filled by _SELECT_REGISTRY
_CTAS_TEMPLATE = """\
CREATE TABLE {ctas_table}
WITH (
    format              = 'PARQUET',
    parquet_compression = 'SNAPPY',
    external_location   = '{external_location}'
)
AS
{select_body}"""


# ---------------------------------------------------------------------------
# Public builders
# ---------------------------------------------------------------------------


def build_ctas_sql(
    dataset_id: str,
    dt: str,
    database: str,
    curated_bucket: str,
    curated_prefix: str = "curated",
    ctas_table: str | None = None,
    run_id: str | None = None,
) -> tuple[str, str]:
    """Build the full CTAS SQL string.

    When *run_id* is provided the output is written under
    ``curated/<dataset_id>/dt=<dt>/run=<run_id>/`` and a literal
    ``'<run_id>' AS run_id`` column is appended to the SELECT body so the
    run identifier is embedded directly in the Parquet files (useful for
    debugging raw files without reading partition metadata).

    Returns:
        ``(sql, ctas_table_name)`` — *ctas_table_name* is the short-lived
        Glue Catalog entry; drop it after a successful run.

    Raises:
        ValueError: If *dataset_id* is not in :data:`REGISTRY`.
    """
    if dataset_id not in _SELECT_REGISTRY:
        raise ValueError(
            f"Unknown dataset_id: {dataset_id!r}. "
            f"Known: {sorted(_SELECT_REGISTRY)}"
        )

    spec = REGISTRY[dataset_id]
    suffix = uuid.uuid4().hex[:8]
    dt_tag = dt.replace("-", "")
    ctas_table = ctas_table or f"_ctas_{dataset_id}_{dt_tag}_{suffix}"

    if run_id is not None:
        external_location = (
            f"s3://{curated_bucket}/{curated_prefix.rstrip('/')}"
            f"/{dataset_id}/dt={dt}/run={run_id}/"
        )
    else:
        external_location = (
            f"s3://{curated_bucket}/{curated_prefix.rstrip('/')}"
            f"/{dataset_id}/dt={dt}/"
        )

    select_body = _SELECT_REGISTRY[dataset_id].format(
        database=database,
        raw_table=spec.raw_table,
        dt=dt,
    )

    if run_id is not None:
        # Append run_id as a literal data column so it is embedded in the
        # Parquet file — useful when inspecting raw files directly.
        select_body = select_body.replace(
            "\nFROM ", f",\n  '{run_id}' AS run_id\nFROM ", 1
        )

    sql = _CTAS_TEMPLATE.format(
        ctas_table=f"{database}.{ctas_table}",
        external_location=external_location,
        select_body=select_body,
    )

    return sql, ctas_table


# ---------------------------------------------------------------------------
# AthenaCtasRunner
# ---------------------------------------------------------------------------


class AthenaCtasRunner:
    """Execute Athena CTAS queries to produce curated Parquet from raw JSONL.GZ.

    Args:
        database:        Athena / Glue database name.  Raw tables and the
                         temporary CTAS table are created here.
        workgroup:       Athena workgroup.  Controls the output location for
                         query metadata; set "Enforce workgroup settings" ON
                         in the console to lock the results bucket.
        curated_bucket:  S3 bucket for curated Parquet output.
        curated_prefix:  S3 key prefix (default: ``"curated"``).
        overwrite:       When ``True`` delete existing S3 objects under the
                         target run-partition prefix before running CTAS.
                         Not needed when *run_id* is set (each run writes to
                         a unique prefix).  Default ``False``.
        drop_ctas_table: When ``True`` (default) drop the ephemeral Glue
                         Catalog table created by CTAS after success.
                         S3 data is **never** deleted by this step.
        run_id:          Identifies this execution run.  Used as the
                         ``run=<run_id>`` path segment under each dt-partition
                         and embedded as a ``run_id`` column in Parquet output.
                         Auto-generated (UTC ``YYYYMMDDTHHMMSSz``) when ``None``.
        **boto3_kwargs:  Forwarded to both ``boto3.client("athena", …)`` and
                         ``boto3.client("s3", …)``, e.g. ``region_name``.
    """

    def __init__(
        self,
        database: str,
        workgroup: str,
        curated_bucket: str,
        curated_prefix: str = "curated",
        overwrite: bool = False,
        drop_ctas_table: bool = True,
        run_id: str | None = None,
        **boto3_kwargs: Any,
    ) -> None:
        try:
            import boto3  # noqa: PLC0415
        except ImportError as exc:
            raise RuntimeError(
                "boto3 is required for AthenaCtasRunner. "
                "Install with: pip install boto3"
            ) from exc

        self._database = database
        self._workgroup = workgroup
        self._curated_bucket = curated_bucket
        self._curated_prefix = curated_prefix.rstrip("/")
        self._overwrite = overwrite
        self._drop = drop_ctas_table
        self._run_id = run_id or datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        self._athena = boto3.client("athena", **boto3_kwargs)
        self._s3 = boto3.client("s3", **boto3_kwargs)

    @property
    def run_id(self) -> str:
        """The run identifier used for S3 path partitioning and Parquet metadata."""
        return self._run_id

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def start_ctas_query(
        self,
        dataset_id: str,
        dt: str,
    ) -> tuple[str, str]:
        """Submit a CTAS query asynchronously.

        If *overwrite* is enabled, existing S3 objects at the target partition
        path are deleted first (Athena CTAS fails on non-empty locations).

        Returns:
            ``(query_execution_id, ctas_table_name)``

        Raises:
            ValueError:   Unknown *dataset_id*.
            RuntimeError: S3 delete failed (only when *overwrite=True*).
        """
        if self._overwrite:
            self._delete_partition_objects(dataset_id, dt)

        sql, ctas_table = build_ctas_sql(
            dataset_id=dataset_id,
            dt=dt,
            database=self._database,
            curated_bucket=self._curated_bucket,
            curated_prefix=self._curated_prefix,
            run_id=self._run_id,
        )

        resp = self._athena.start_query_execution(
            QueryString=sql,
            QueryExecutionContext={"Database": self._database},
            WorkGroup=self._workgroup,
        )
        return resp["QueryExecutionId"], ctas_table

    def wait_query(
        self,
        query_execution_id: str,
        timeout_sec: int = 120,
        poll_sec: int = 2,
    ) -> tuple[str, str | None, str | None]:
        """Poll ``GetQueryExecution`` until a terminal state is reached.

        Returns:
            ``(state, athena_output_location, reason)``
            *state* is one of ``"SUCCEEDED"``, ``"FAILED"``, ``"CANCELLED"``.
            *reason* contains ``StateChangeReason`` on failure.

        Raises:
            RuntimeError: Query does not reach a terminal state within *timeout_sec*.
        """
        elapsed = 0
        while elapsed < timeout_sec:
            resp = self._athena.get_query_execution(
                QueryExecutionId=query_execution_id
            )
            status = resp["QueryExecution"]["Status"]
            state = status["State"]

            if state in ("SUCCEEDED", "FAILED", "CANCELLED"):
                reason = status.get("StateChangeReason")
                output_location = (
                    resp["QueryExecution"]
                    .get("ResultConfiguration", {})
                    .get("OutputLocation")
                )
                return state, output_location, reason

            time.sleep(poll_sec)
            elapsed += poll_sec

        raise RuntimeError(
            f"Athena CTAS query {query_execution_id} did not complete "
            f"within {timeout_sec}s"
        )

    def drop_ctas_table(self, ctas_table: str) -> None:
        """Drop the ephemeral CTAS table from Glue Catalog.

        S3 data under the ``external_location`` is **not** deleted.
        This is a best-effort cleanup; errors are silently swallowed.
        """
        sql = f"DROP TABLE IF EXISTS {self._database}.{ctas_table}"
        resp = self._athena.start_query_execution(
            QueryString=sql,
            QueryExecutionContext={"Database": self._database},
            WorkGroup=self._workgroup,
        )
        try:
            self.wait_query(resp["QueryExecutionId"], timeout_sec=30)
        except RuntimeError:
            pass  # best-effort; don't fail the pipeline on cleanup

    def curated_location(self, dataset_id: str, dt: str) -> str:
        """Return the S3 directory URI of a curated run-partition (trailing slash)."""
        return (
            f"s3://{self._curated_bucket}/{self._curated_prefix}"
            f"/{dataset_id}/dt={dt}/run={self._run_id}/"
        )

    def run(self, dataset_id: str, dt: str) -> tuple[str, str]:
        """Full CTAS flow: submit → wait → cleanup.

        Returns:
            ``(query_execution_id, curated_s3_location)``

        Raises:
            ValueError:   Unknown *dataset_id*.
            RuntimeError: CTAS FAILED / CANCELLED, or timed out.
        """
        query_id, ctas_table = self.start_ctas_query(dataset_id, dt)
        state, _, reason = self.wait_query(query_id)

        if state != "SUCCEEDED":
            raise RuntimeError(
                f"CTAS failed for {dataset_id} dt={dt}: "
                f"state={state}, reason={reason}, "
                f"query_execution_id={query_id}"
            )

        if self._drop:
            self.drop_ctas_table(ctas_table)

        return query_id, self.curated_location(dataset_id, dt)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _delete_partition_objects(self, dataset_id: str, dt: str) -> None:
        """Delete all S3 objects under the target run-partition prefix."""
        prefix = f"{self._curated_prefix}/{dataset_id}/dt={dt}/run={self._run_id}/"
        paginator = self._s3.get_paginator("list_objects_v2")
        to_delete: list[dict[str, str]] = []

        for page in paginator.paginate(Bucket=self._curated_bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                to_delete.append({"Key": obj["Key"]})

        if to_delete:
            self._s3.delete_objects(
                Bucket=self._curated_bucket,
                Delete={"Objects": to_delete},
            )
