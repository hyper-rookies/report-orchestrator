# Query-Lambda CI Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent silent CI failures from missing config files, improve UNKNOWN error observability with traceback logging and debugId, and surface config-load failures as meaningful QueryErrors instead of bare exceptions.

**Architecture:** Three independent changes touching two source files and one new script. policy_guard wraps its own file-load errors so lambda_handler's bare-`Exception` catch is only for truly unexpected cases. The CI preflight runs before lint/tests so missing files fail fast with a clear message. debugId is injected from Lambda context so AWS traces can be correlated with error responses.

**Tech Stack:** Python 3.14, pytest, bash, GitHub Actions

---

### Task 1: policy_guard — wrap `_load_json` errors as `QueryError`

**Files:**
- Modify: `backend/services/query-lambda/policy_guard.py:188-189`
- Test: `backend/tests/test_query_lambda_buildsql.py`

Currently `_load_json` lets `FileNotFoundError` and `json.JSONDecodeError` propagate raw into `lambda_handler`'s bare `except Exception` block, producing a generic UNKNOWN with no indication of which file is missing.

**Step 1: Write the failing tests**

Add at the bottom of `backend/tests/test_query_lambda_buildsql.py`:

```python
import sys
from pathlib import Path


def test_missing_policy_file_returns_unknown_with_filename(monkeypatch):
    import policy_guard as pg  # available on sys.path after _load_handler_module()

    monkeypatch.setattr(pg, "SHARED_DIR", Path("/nonexistent/__test__"))

    response = query_handler.lambda_handler(_base_event(), None)
    body = json.loads(response["body"])

    assert body["error"]["code"] == "UNKNOWN"
    assert "reporting_policy.json" in body["error"]["message"]


def test_invalid_json_policy_file_returns_unknown_with_filename(tmp_path, monkeypatch):
    import policy_guard as pg

    (tmp_path / "reporting_policy.json").write_text("{ invalid json", encoding="utf-8")
    (tmp_path / "catalog_discovered.json").write_text("{ invalid json", encoding="utf-8")
    monkeypatch.setattr(pg, "SHARED_DIR", tmp_path)

    response = query_handler.lambda_handler(_base_event(), None)
    body = json.loads(response["body"])

    assert body["error"]["code"] == "UNKNOWN"
    assert "reporting_policy.json" in body["error"]["message"]
```

**Step 2: Run to verify they fail**

```bash
cd backend
pytest tests/test_query_lambda_buildsql.py::test_missing_policy_file_returns_unknown_with_filename tests/test_query_lambda_buildsql.py::test_invalid_json_policy_file_returns_unknown_with_filename -v
```

Expected: `FAILED` — `AssertionError` because message is currently `"Unexpected query-lambda error."` (no filename).

**Step 3: Implement the fix in `policy_guard.py`**

Replace the current `_load_json` function (line 188-189):

```python
# BEFORE
def _load_json(filename: str) -> dict[str, Any]:
    return json.loads((SHARED_DIR / filename).read_text(encoding="utf-8"))
```

```python
# AFTER
def _load_json(filename: str) -> dict[str, Any]:
    try:
        return json.loads((SHARED_DIR / filename).read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise QueryError("UNKNOWN", f"Configuration file '{filename}' is missing.")
    except json.JSONDecodeError:
        raise QueryError("UNKNOWN", f"Configuration file '{filename}' is invalid JSON.")
```

**Step 4: Run tests to verify they pass**

```bash
cd backend
pytest tests/test_query_lambda_buildsql.py -v
```

Expected: all tests `PASSED` (9 total including 2 new).

**Step 5: Commit**

```bash
git add backend/services/query-lambda/policy_guard.py backend/tests/test_query_lambda_buildsql.py
git commit -m "fix(query): wrap _load_json errors as QueryError with filename"
```

---

### Task 2: handler.py — log traceback and add `debugId` on UNKNOWN

**Files:**
- Modify: `backend/services/query-lambda/handler.py`
- Test: `backend/tests/test_query_lambda_buildsql.py`

Currently the bare `except Exception` silently swallows any unexpected error. Need: (1) `logger.exception` so CloudWatch gets the full traceback, (2) `debugId` in the response body so the Bedrock Agent (or a human) can correlate the response with the CloudWatch log entry.

**Step 1: Write the failing test**

Add at the bottom of `backend/tests/test_query_lambda_buildsql.py`:

```python
def test_unknown_error_response_includes_debug_id():
    """An unexpected exception must produce UNKNOWN with a debugId field."""
    import policy_guard as pg

    # Force an unexpected error that is NOT a QueryError
    # (e.g., policy_guard raises AttributeError by injecting a bad SHARED_DIR type)
    import unittest.mock

    with unittest.mock.patch.object(
        pg, "_load_json", side_effect=RuntimeError("synthetic unexpected error")
    ):
        response = query_handler.lambda_handler(_base_event(), None)

    body = json.loads(response["body"])
    assert body["error"]["code"] == "UNKNOWN"
    assert "debugId" in body["error"]
    assert isinstance(body["error"]["debugId"], str)
    assert len(body["error"]["debugId"]) > 0
```

**Step 2: Run to verify it fails**

```bash
cd backend
pytest tests/test_query_lambda_buildsql.py::test_unknown_error_response_includes_debug_id -v
```

Expected: `FAILED` — `KeyError: 'debugId'` (field not present yet).

**Step 3: Implement the fix in `handler.py`**

Replace the full file content:

```python
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
```

Key changes vs original:
- `_context` → `context` (no longer intentionally unused)
- Added `import logging`, `import uuid`, `logger = logging.getLogger(__name__)`
- `except Exception` block: computes `debug_id` from `context.aws_request_id` with `uuid.uuid4()` fallback, calls `logger.exception(...)`, adds `"debugId"` to error response

**Step 4: Run all tests**

```bash
cd backend
pytest tests/test_query_lambda_buildsql.py -v
```

Expected: all 10 tests `PASSED`.

**Step 5: Commit**

```bash
git add backend/services/query-lambda/handler.py backend/tests/test_query_lambda_buildsql.py
git commit -m "fix(query): log traceback and add debugId on UNKNOWN error"
```

---

### Task 3: CI Preflight — fail fast on missing shared config files

**Files:**
- Create: `backend/scripts/preflight_ci.sh`
- Modify: `.github/workflows/ci.yml`

The CI currently runs pytest before checking whether the shared JSON files that `policy_guard` depends on actually exist in the repo. If they're accidentally deleted or not committed, tests fail with an opaque error. The preflight script catches this before any Python code runs.

**Step 1: Create the preflight script**

Create `backend/scripts/preflight_ci.sh`:

```bash
#!/usr/bin/env bash
# Preflight checks — run before lint and tests.
# Verifies that required shared config files are present.
# Exit 1 immediately with a clear message if any file is missing.
set -euo pipefail

SHARED_DIR="services/report-orchestrator-lambda/src/shared"

REQUIRED_FILES=(
    "$SHARED_DIR/catalog_discovered.json"
    "$SHARED_DIR/reporting_policy.json"
)

MISSING=()
for f in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$f" ]; then
        MISSING+=("$f")
    fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
    echo "ERROR: preflight failed — required files not found:"
    for f in "${MISSING[@]}"; do
        echo "  missing: $f"
    done
    exit 1
fi

echo "preflight OK — all required files present"
```

Note: paths are relative to `backend/` because the CI `working-directory` is `backend`.

**Step 2: Make it executable**

```bash
chmod +x backend/scripts/preflight_ci.sh
```

**Step 3: Verify the script works locally (both cases)**

Passing case — from repo root:
```bash
cd backend && bash scripts/preflight_ci.sh
```
Expected output: `preflight OK — all required files present`

Failing case (simulate missing file):
```bash
cd backend && bash -c 'SHARED_DIR=services/report-orchestrator-lambda/src/shared; bash scripts/preflight_ci.sh' 2>&1 || true
```
Or manually rename a file temporarily and run — expected:
```
ERROR: preflight failed — required files not found:
  missing: services/report-orchestrator-lambda/src/shared/reporting_policy.json
```

**Step 4: Add preflight step to `.github/workflows/ci.yml`**

Add a `Preflight` step between `Install dependencies` and `Lint (ruff)`:

```yaml
      - name: Preflight checks
        run: bash scripts/preflight_ci.sh
```

Full updated `ci.yml`:

```yaml
name: CI

"on":
  pull_request:
    branches: ["main"]
  push:
    branches: ["main"]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  backend:
    name: Backend (Python)
    runs-on: ubuntu-latest
    env:
      BACKEND_DIR: backend
    defaults:
      run:
        shell: bash
        working-directory: ${{ env.BACKEND_DIR }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.14"
          cache: "pip"

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          if [ -f "pyproject.toml" ]; then
            pip install -e ".[dev]" || pip install -e "."
          elif [ -f "requirements.txt" ]; then
            pip install -r requirements.txt
          else
            echo "No pyproject.toml or requirements.txt in $PWD" && exit 1
          fi

      - name: Preflight checks
        run: bash scripts/preflight_ci.sh

      - name: Lint (ruff)
        run: |
          python -m pip install ruff
          ruff check .

      - name: Unit tests (pytest)
        run: |
          python -m pip install pytest
          pytest -q
```

**Step 5: Run full test suite and ruff to confirm nothing broken**

```bash
cd backend
python -m pip install ruff && ruff check .
pytest -q
```

Expected:
```
ruff: no issues found (or passes)
45 passed in X.XXs
```

**Step 6: Commit both files**

```bash
git add backend/scripts/preflight_ci.sh .github/workflows/ci.yml
git commit -m "ci: add preflight check for required shared config files"
```

---

## Verification Summary

After all 3 tasks:

| Check | Command | Expected |
|---|---|---|
| Missing file → UNKNOWN with filename | `pytest tests/test_query_lambda_buildsql.py::test_missing_policy_file_returns_unknown_with_filename` | PASS |
| Invalid JSON → UNKNOWN with filename | `pytest tests/test_query_lambda_buildsql.py::test_invalid_json_policy_file_returns_unknown_with_filename` | PASS |
| Unexpected error → response includes debugId | `pytest tests/test_query_lambda_buildsql.py::test_unknown_error_response_includes_debug_id` | PASS |
| Full suite | `cd backend && pytest -q` | 48 passed |
| Ruff | `cd backend && ruff check .` | no issues |
| Preflight pass | `cd backend && bash scripts/preflight_ci.sh` | `preflight OK` |
| Preflight fail | rename a JSON file, run script | `exit 1` + clear message |

## Files Changed (source count for PR_GUIDELINES.md)

| File | Status | Counted? |
|---|---|---|
| `backend/services/query-lambda/policy_guard.py` | modify | ✅ source (1) |
| `backend/services/query-lambda/handler.py` | modify | ✅ source (2) |
| `backend/scripts/preflight_ci.sh` | create | ✅ source (3) |
| `backend/tests/test_query_lambda_buildsql.py` | modify | ❌ test (not counted) |
| `.github/workflows/ci.yml` | modify | ❌ config (not counted) |

**Total source files: 3 — within PR limit.**
