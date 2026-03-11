"""Runtime environment guard — fail fast on wrong region / bucket.

Call :func:`assert_prod_env` at the top of any runner script or Lambda handler
to catch misconfigured environments before any AWS calls are made.

Required environment variables
--------------------------------
AWS_REGION          ap-northeast-2
ATHENA_WORKGROUP    hyper-intern-m1c-wg
ATHENA_DATABASE     hyper_intern_m1c
ATHENA_OUTPUT_LOCATION
DATA_BUCKET         hyper-intern-m1c-data-bucket
"""
from __future__ import annotations

import os

_EXPECTED_REGION = "ap-northeast-2"
_EXPECTED_DATA_BUCKET = "hyper-intern-m1c-data-bucket"
_EXPECTED_RESULTS_BUCKET = "hyper-intern-m1c-athena-results-bucket"
_EXPECTED_WORKGROUP = "hyper-intern-m1c-wg"
def assert_prod_env() -> None:
    """Assert all required env vars are set and point to Seoul resources.

    Raises:
        ValueError: One or more guard conditions are not met.  The message
                    lists every violation so the caller can fix them all at once.
    """
    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION", "")
    output_location = os.environ.get("ATHENA_OUTPUT_LOCATION", "")
    data_bucket = os.environ.get("DATA_BUCKET", "")
    workgroup = os.environ.get("ATHENA_WORKGROUP", "")

    errors: list[str] = []

    if region != _EXPECTED_REGION:
        errors.append(
            f"AWS_REGION must be '{_EXPECTED_REGION}' (Seoul), got '{region}'"
        )

    if _EXPECTED_RESULTS_BUCKET not in output_location:
        errors.append(
            f"ATHENA_OUTPUT_LOCATION must contain '{_EXPECTED_RESULTS_BUCKET}', "
            f"got '{output_location or '(not set)'}'"
        )

    if data_bucket != _EXPECTED_DATA_BUCKET:
        errors.append(
            f"DATA_BUCKET must be '{_EXPECTED_DATA_BUCKET}', "
            f"got '{data_bucket or '(not set)'}'"
        )

    if workgroup != _EXPECTED_WORKGROUP:
        errors.append(
            f"ATHENA_WORKGROUP must be '{_EXPECTED_WORKGROUP}', "
            f"got '{workgroup or '(not set)'}'"
        )

    if errors:
        raise ValueError(
            "Environment guard failed — possible wrong region or bucket:\n"
            + "\n".join(f"  - {e}" for e in errors)
        )
