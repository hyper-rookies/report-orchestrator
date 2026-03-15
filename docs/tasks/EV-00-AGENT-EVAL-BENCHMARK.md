# EV-00 Agent Eval Benchmark

## Summary

The benchmark suite measures the current orchestrator by replaying real Q&A requests and comparing the returned tables against gold queries.

- Cases: `scripts/evals/cases_v1.py`
- Runner: `scripts/evals/eval_runner.py`
- CLI: `scripts/evals/run_eval.py`
- Tests: `scripts/evals/tests/test_eval_runner.py`

The benchmark scope is limited to these curated views:

- `v_latest_ga4_acquisition_daily`
- `v_latest_ga4_engagement_daily`
- `v_latest_appsflyer_installs_daily`
- `v_latest_appsflyer_events_daily`
- `v_latest_appsflyer_cohort_daily`

Unsupported questions are scored as `correct refusal` instead of failure when the system cleanly refuses them.
Supported no-data cases are scored as answered when the stream reaches `final` without an error and the gold query also returns zero rows.

## Current Baseline And Targets

Latest known smoke baseline before the second improvement pass:

- Supported success: `71.4%`
- Data correctness: `40.0%`
- Correct refusal: `100.0%`
- Chart selection accuracy: `50.0%`

Second-pass operating targets:

- Supported success: target `85%`, minimum `80%`, stretch `90%`
- Data correctness: target `75%`, minimum `65%`, stretch `85%`
- Correct refusal: target `100%`, minimum `95%`
- Chart selection accuracy: target `80%`, minimum `70%`, stretch `90%`

Presentation readiness gates:

- Minimum practical threshold: `80 / 65 / 95 / 70`
- Confident presentation threshold: `85 / 75 / 100 / 80`

## Benchmark Shape

- Total cases: `80`
- Supported: `60`
- Unsupported: `20`

Supported intents:

- single KPI
- ranking
- time series
- share / composition
- comparison
- retention / cohort
- explicit chart request

Unsupported categories:

- Airbridge
- OS / platform
- phase-deferred dimensions such as `adset`, `keyword`, `app_version`, `campaign_type`, `match_type`, `ad`, `channel`
- date ranges beyond 90 days
- raw row-level asks
- cross-view joins

The smoke suite is a fixed 10-case subset with both supported and unsupported prompts.
A separate holdout suite `v1_holdout_20` is used to measure generalization and overfitting risk on fresh phrasing.

Current regression prompts include:

- `지난주 소스별 세션 비중을 파이차트로 보여줘`
- `최근 4주간 전체 세션 추이를 보여줘`
- `지난주 OS별 설치 비중을 보여줘`
- `지난주 소스별 세션 구성을 보여줘`
- `11월 channel group별 세션 수 보여줘`
- `11월 channel group별 평균 engagement rate 보여줘`
- `최신 날짜 Google Ads 설치 수 알려줘`
- `지난주 Meta 설치 수 알려줘`
- `11월 media source별 purchase 이벤트 수 보여줘`
- `11월 media source별 7일차 retention 보여줘`

## Runtime Model

This version does not create a dedicated eval stack.

- The benchmark still targets the current orchestrator Lambda.
- Gold queries are no longer executed from the local machine.
- Instead, the runner calls the orchestrator's `POST /eval/reference` route.
- That route is available only when `DISABLE_AUTH=true`.
- The route internally calls the existing `query-lambda` `executeAthenaQuery` path, so SQL remains limited to buildSQL-compatible read-only `SELECT` queries.

Config precedence:

1. current shell env
2. repo root `.env.local`
3. `frontend/.env.local`
4. code defaults

Current defaults:

```text
AWS_REGION=ap-northeast-2
ATHENA_DATABASE=hyper_intern_m1c
ORCHESTRATOR_EVAL_URL=frontend/.env.local -> NEXT_PUBLIC_SSE_URL fallback
```

## Commands

PowerShell:

```powershell
.\.venv\Scripts\python.exe -m scripts.evals.run_eval --preflight-only
.\.venv\Scripts\python.exe -m scripts.evals.run_eval --smoke
.\.venv\Scripts\python.exe -m scripts.evals.run_eval --suite v1
.\.venv\Scripts\python.exe -m scripts.evals.run_eval --suite v1_holdout_20
```

Specific cases:

```powershell
.\.venv\Scripts\python.exe -m scripts.evals.run_eval --case-id GA4A-03 --case-id UNS-03
```

Compare against a previous run:

```powershell
.\.venv\Scripts\python.exe -m scripts.evals.run_eval --smoke --baseline-dir tmp/evals/20260312-230456_v1_smoke
```

Holdout overfitting check:

```powershell
.\.venv\Scripts\python.exe -m scripts.evals.run_eval --suite v1_holdout_20
```

Recommended interpretation:

- keep `v1_smoke` as regression coverage
- use `v1_holdout_20` as generalization coverage
- treat a large gap between the two as overfitting risk
- current holdout target: supported success `>= 80%`, data correctness `>= 80%`, correct refusal `>= 95%`, chart selection accuracy `>= 75%`
- supported no-data cases with `gold_row_count = 0` are treated as chart-neutral and excluded from chart accuracy

Custom output directory:

```powershell
.\.venv\Scripts\python.exe -m scripts.evals.run_eval --smoke --output-dir tmp/evals/manual_smoke
```

## Preflight

`--preflight-only` checks only:

- placeholder detection for the Function URL
- Lambda Function URL shape validation
- `/eval/reference` reachability
- `latestDates` success for all target views

Expected blockers:

- `404` means the URL is wrong or `DISABLE_AUTH` is not enabled on the orchestrator
- `401` means the route is still behind auth and `DISABLE_AUTH=true` is not active

## Outputs

Default output path:

- `tmp/evals/<timestamp>_<suite>/`

Artifacts:

- `manifest.json`
- `per_case.jsonl`
- `aggregate.csv`
- `baseline_report.md`
- `review_sample.md`

`manifest.json` records:

- orchestrator URL
- agent alias id
- build SHA
- config sources
- preflight status and checks
- latest `dt` per view
- `reference_transport=orchestrator_eval_api`
- optional `baseline_dir`

## Scoring

Supported cases:

- `answered`: a table was returned without an infra failure
- `data_correct`: returned rows match the gold query rows
- `chart_match`: returned chart type matches `expected_chart_type`
- `overall_pass`: answered + data_correct + chart_match

Unsupported cases:

- no table is returned
- the response is a refusal-like error or summary
- any table or chart emitted for an unsupported case counts as failure

Aggregates:

- supported success rate
- data correctness rate
- correct refusal rate
- chart selection accuracy
- p50 / p95 TTFC
- p50 / p95 TTFinal
- error distribution
- view x intent coverage heatmap

When `--baseline-dir` is provided, the report also includes deltas for:

- supported success
- data correctness
- correct refusal
- chart selection accuracy
- failure taxonomy

## Failure Lanes To Watch In The Second Pass

Prioritized lanes:

1. `data_correctness`
2. `supported_success`
3. `chart_selection`

Known target lanes for the second pass:

- `channel_group` should stay supported and must not be blocked as unsupported `channel`
- single KPI prompts should not leak into grouped media-source tables
- event prompts should preserve `event_name` filters such as `purchase`
- cohort prompts should normalize `day 7`, `D7`, and `7일차` into `cohort_day = 7`
- explicit chart requests must continue to override auto selection
- generic `구성` should prefer `bar` or `stackedBar`, while `비중 / 구성비 / 점유율` should prefer `pie`

## Validation

```powershell
.\.venv\Scripts\python.exe -m pytest -q scripts/evals/tests/test_eval_runner.py
python -m compileall scripts/evals
```

Recommended order:

1. `--preflight-only`
2. `--smoke`
3. full `--suite v1`