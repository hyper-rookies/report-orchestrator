#!/usr/bin/env bash
# Preflight checks — run before lint and tests.
# Verifies that required shared config files are present.
# Paths are relative to backend/ (the CI working-directory).
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
