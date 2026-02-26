"""Athena-based implementation of PartitionRegistrarPort.

Registers Hive-style dt-partitions via::

    ALTER TABLE {database}.{table}
    ADD IF NOT EXISTS PARTITION (dt='{dt}')
    LOCATION '{location}';

Requires ``boto3``.  IAM permissions needed:
  - athena:StartQueryExecution
  - athena:GetQueryExecution
  - s3:GetBucketLocation / s3:GetObject / s3:ListBucket on the workgroup
    output bucket (for query result storage)
  - glue:GetTable / glue:BatchCreatePartition on the target table
"""
from __future__ import annotations

import time
from typing import Any

_SQL_TEMPLATE = (
    "ALTER TABLE {database}.{table}\n"
    "ADD IF NOT EXISTS PARTITION (dt='{dt}')\n"
    "LOCATION '{location}';"
)

_TERMINAL_STATES = {"SUCCEEDED", "FAILED", "CANCELLED"}
_POLL_INTERVAL_SEC = 2


class AthenaPartitionManager:
    """Registers Hive-style dt-partitions via Athena StartQueryExecution.

    Implements
    :class:`~report_system.domain.curation.ports.PartitionRegistrarPort`.

    Args:
        database:      Athena/Glue database name.
        workgroup:     Athena workgroup that owns the query output bucket.
        **boto3_kwargs: Forwarded to ``boto3.client("athena", ...)``
                        (e.g. ``region_name``, ``endpoint_url`` for LocalStack).
    """

    def __init__(
        self,
        database: str,
        workgroup: str,
        **boto3_kwargs: Any,
    ) -> None:
        try:
            import boto3  # noqa: PLC0415
        except ImportError as exc:
            raise RuntimeError(
                "boto3 is required for Athena partition management. "
                "Install it with: pip install boto3"
            ) from exc

        self._database = database
        self._workgroup = workgroup
        self._athena = boto3.client("athena", **boto3_kwargs)

    # ------------------------------------------------------------------
    # Low-level primitives (public so callers can compose freely)
    # ------------------------------------------------------------------

    def add_dt_partition(
        self,
        database: str,
        table: str,
        dt: str,
        location: str,
        workgroup: str,
    ) -> str:
        """Fire ALTER TABLE … ADD PARTITION and return the QueryExecutionId.

        Does **not** wait for completion — call :meth:`wait` afterwards.
        *location* is normalised to include a trailing slash.
        """
        if not location.endswith("/"):
            location += "/"

        sql = _SQL_TEMPLATE.format(
            database=database,
            table=table,
            dt=dt,
            location=location,
        )

        try:
            resp = self._athena.start_query_execution(
                QueryString=sql,
                QueryExecutionContext={"Database": database},
                WorkGroup=workgroup,
            )
        except Exception as exc:
            raise RuntimeError(
                f"Athena StartQueryExecution failed "
                f"for {database}.{table} dt={dt}: {exc}"
            ) from exc

        return resp["QueryExecutionId"]

    def wait(
        self,
        query_execution_id: str,
        timeout_sec: int = 60,
    ) -> tuple[str, str | None]:
        """Poll GetQueryExecution until a terminal state is reached.

        Returns ``(state, failure_reason)`` where *state* is one of
        ``SUCCEEDED``, ``FAILED``, or ``CANCELLED``.
        *failure_reason* is ``None`` on success.
        Raises :class:`RuntimeError` on timeout.
        """
        deadline = time.monotonic() + timeout_sec

        while True:
            try:
                resp = self._athena.get_query_execution(
                    QueryExecutionId=query_execution_id
                )
            except Exception as exc:
                raise RuntimeError(
                    f"Athena GetQueryExecution failed "
                    f"for {query_execution_id}: {exc}"
                ) from exc

            status = resp["QueryExecution"]["Status"]
            state: str = status["State"]

            if state in _TERMINAL_STATES:
                reason: str | None = status.get("StateChangeReason")
                return state, reason

            if time.monotonic() > deadline:
                raise RuntimeError(
                    f"Athena query {query_execution_id} did not complete within "
                    f"{timeout_sec}s (last state: {state})"
                )

            time.sleep(_POLL_INTERVAL_SEC)

    # ------------------------------------------------------------------
    # PartitionRegistrarPort implementation
    # ------------------------------------------------------------------

    def add_partition(self, table: str, dt: str, location: str) -> None:
        """Register a dt-partition and block until Athena confirms success.

        Uses the ``database`` and ``workgroup`` supplied at construction.
        Raises :class:`RuntimeError` if the query fails, is cancelled, or
        times out.
        """
        qid = self.add_dt_partition(
            database=self._database,
            table=table,
            dt=dt,
            location=location,
            workgroup=self._workgroup,
        )
        state, reason = self.wait(qid)
        if state != "SUCCEEDED":
            raise RuntimeError(
                f"Athena partition registration failed for "
                f"{self._database}.{table} dt={dt}: "
                f"state={state} reason={reason}"
            )
