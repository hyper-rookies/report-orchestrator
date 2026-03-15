from __future__ import annotations

import argparse
import json
import sys

from scripts.evals.eval_runner import (
    PreflightError,
    format_config_summary,
    format_preflight_summary,
    load_result_rows,
    load_cases,
    load_config_from_env,
    run_preflight,
    run_suite,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the agent Q&A benchmark suite.")
    parser.add_argument("--suite", default="v1", help="Benchmark suite name. Default: v1. Supported: v1, v1_holdout_20")
    parser.add_argument(
        "--case-id",
        action="append",
        dest="case_ids",
        help="Specific case id to run. Can be passed multiple times.",
    )
    parser.add_argument("--limit", type=int, help="Run only the first N cases after filtering.")
    parser.add_argument("--timeout-seconds", type=int, default=45, help="SSE request timeout.")
    parser.add_argument("--review-seed", type=int, default=42, help="Seed for review sampling.")
    parser.add_argument("--output-dir", help="Override output directory.")
    parser.add_argument(
        "--baseline-dir",
        help="Optional previous eval output directory. If set, the report includes baseline deltas.",
    )
    parser.add_argument(
        "--preflight-only",
        action="store_true",
        help="Validate env/auth/Athena connectivity only and skip the benchmark run.",
    )
    parser.add_argument(
        "--smoke",
        action="store_true",
        help="Run the fixed 10-case smoke suite.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    suite_name = f"{args.suite}_smoke" if args.smoke else args.suite
    config = load_config_from_env(
        suite_name=suite_name,
        output_dir=args.output_dir,
        timeout_seconds=args.timeout_seconds,
        review_seed=args.review_seed,
    )
    print(format_config_summary(config))

    try:
        preflight = run_preflight(config)
    except PreflightError as exc:
        print("\nPreflight failed:\n", file=sys.stderr)
        print(str(exc), file=sys.stderr)
        return 1

    print(format_preflight_summary(preflight))
    if args.preflight_only:
        return 0

    cases = load_cases(suite_name=suite_name, case_ids=args.case_ids, limit=args.limit, smoke=args.smoke)
    if not cases:
        raise SystemExit("No cases selected.")

    baseline_results = load_result_rows(args.baseline_dir) if args.baseline_dir else None
    result = run_suite(
        config=config,
        cases=cases,
        preflight=preflight,
        baseline_results=baseline_results,
        baseline_dir=args.baseline_dir,
    )
    print(
        json.dumps(
            {
                "output_dir": result["output_dir"],
                "aggregate": result["aggregate"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
