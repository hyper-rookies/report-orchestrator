# System Architecture

## 1. High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ AWS Cloud                                                                   │
│                                                                             │
│  [User (Browser)]                                                           │
│       │                                                                     │
│       │── HTTPS ──► [API Gateway] ──► [Cognito Authorizer]                 │
│       │               (auth/login &          JWT validation only            │
│       │               regular APIs)          Returns auth token             │
│       │                                                                     │
│       │── SSE (pre-authenticated) ──► [Lambda Function URL]                │
│                                              │                              │
│                                              ▼                              │
│                                    [Orchestrator Lambda]                    │
│                                              │                              │
│                                              │  InvokeAgent (streaming)     │
│                                              ▼                              │
│                                    [Amazon Bedrock Agent]                   │
│                                              │                              │
│                    ┌─────────────────────────┼──────────────────────┐       │
│                    │                         │                      │       │
│                    ▼                         ▼                      ▼       │
│           [Action Group: query]   [Action Group: analysis]  [Action Group: viz] │
│           [query-lambda]          [analysis-lambda]         [viz-lambda]    │
│                    │                                                        │
│                    ▼                                                        │
│                [Athena] ──► [S3 Athena Results]                             │
│                    │                                                        │
│                [Glue Data Catalog]                                          │
│                    │                                                        │
│                [S3 Raw / S3 Curated]                                        │
│                                                                             │
│  ── Batch Ingestion (D-1 schedule) ─────────────────────────────────────── │
│                                                                             │
│  [EventBridge (3AM D-1)]                                                    │
│       │                                                                     │
│       ▼                                                                     │
│  [Batch Lambda] ──► GA4 / AppsFlyer / Airbridge (External APIs)            │
│       │                                                                     │
│       ├──► [S3 Raw] ──► [Glue Data Catalog] (partition registration)       │
│       │                                                                     │
│       └── on failure ──► [SQS] ──► retry ×3 ──► [DLQ] ──► [CloudWatch Alarm] │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Entry Points: Why Two — API Gateway + Lambda Function URL

The system exposes two distinct entry points. They serve different purposes and are not interchangeable.

| | API Gateway | Lambda Function URL |
|---|---|---|
| **Purpose** | Authentication, login, regular REST APIs | Realtime SSE streaming |
| **Protocol** | HTTP request/response | HTTP with chunked/streaming response |
| **Auth** | Cognito Authorizer validates JWT | Pre-authenticated users only (token already issued by API Gateway flow) |
| **Why not unified** | API Gateway does not support SSE or response streaming. Routing a streaming response through API Gateway would buffer the body, destroying the SSE event-by-event delivery model. |

**Rule**: API Gateway is never in the SSE path. The user calls the Lambda Function URL directly after authentication.

---

## 3. Realtime Analysis Data Flow

```
User (browser)
  └─ opens SSE connection ──► Lambda Function URL
                                    │
                           Orchestrator Lambda
                           (SSE scaffolding only;
                            does NOT call query/analysis/viz Lambdas directly)
                                    │
                           InvokeAgent (streaming)
                                    │
                           Amazon Bedrock Agent
                           (orchestration: decides which Action Groups
                            to call, in what order, and how many times)
                                    │
              ┌─────────────────────┼──────────────────────┐
              │                     │                      │
     Action Group: query   Action Group: analysis  Action Group: viz
     query-lambda           analysis-lambda         viz-lambda
              │
       buildSQL → executeAthenaQuery
              │
           Athena
              │
       S3 Athena Results
              │
     (rows returned to Agent)
              │
     Agent passes rows to analysis / viz as needed
              │
     Orchestrator Lambda streams Agent events via SSE
              │
     User receives: meta → progress → table → chart → final
```

**Key constraint**: The Orchestrator Lambda's sole responsibility is SSE scaffolding and Bedrock Agent runtime invocation/streaming. It does not contain report logic, SQL logic, or chart logic. It does not call query-lambda, analysis-lambda, or viz-lambda directly. Those are called exclusively by the Bedrock Agent through Action Group invocations.

---

## 4. Batch Ingestion Data Flow (D-1)

```
EventBridge (cron: 3AM, D-1)
  └─► Batch Lambda
        ├─ fetch GA4 raw data       ──► S3 Raw (JSONL.GZ)
        ├─ fetch AppsFlyer raw data ──► S3 Raw (JSONL.GZ)
        └─ fetch Airbridge raw data ──► S3 Raw (JSONL.GZ)
              │
              └─ register partition ──► Glue Data Catalog
                                          (ALTER TABLE ADD PARTITION)
              │
              └─ on failure ──► SQS ──► retry (max 3) ──► DLQ ──► CloudWatch Alarm
```

Athena queries Glue Data Catalog for schema/partition metadata and scans S3 for data. Query results are written to S3 Athena Results bucket.

---

## 5. Responsibility Separation

| Actor | Owns | Does NOT own |
|---|---|---|
| **Bedrock Agent** | Orchestration: which Action Groups to invoke, in what order, loop termination, error recovery | Report formatting, SQL execution, chart rendering |
| **query-lambda** | SQL generation (`buildSQL`), Athena execution (`executeAthenaQuery`), catalog + policy enforcement | Data comparison, visualization |
| **analysis-lambda** | Pure computation: delta, growth rate, period-over-period (`computeDelta`) | Data fetching, visualization |
| **viz-lambda** | Chart spec generation (`buildChartSpec`) | Data fetching, computation |
| **Orchestrator Lambda** | SSE scaffolding, Bedrock Agent invocation/streaming, auth token forwarding | Report logic, SQL, chart logic, direct Lambda-to-Lambda calls |
| **Codex** | Writes all Lambda source code, writes tests, updates contracts as instructed | Infrastructure (IAM, CDK, Terraform), architectural decisions |
| **Claude** | Reviews contracts and architecture, instructs Codex, proposes design changes | Writing Lambda code, modifying infrastructure |
| **CI** | Runs `pytest`, `tsc --noEmit`, contract schema validation; blocks merge on failure | Architectural decisions, code authorship |

---

## 6. AWS Services Reference

| Service | Role |
|---|---|
| API Gateway | Auth entry point; Cognito Authorizer integration |
| Cognito | JWT issuance and validation |
| Lambda Function URL | SSE entry point; `InvokeMode: RESPONSE_STREAM` |
| Orchestrator Lambda | Node.js 18+; `awslambda.streamifyResponse`; Bedrock Agent SDK |
| Amazon Bedrock Agent | LLM orchestration; Action Group dispatch |
| query-lambda | Python or Node.js; `boto3` Athena client |
| analysis-lambda | Python; pure computation, no AWS SDK calls |
| viz-lambda | Python or Node.js; pure spec generation, no AWS SDK calls |
| Athena | SQL query engine; workgroup `hyper-intern-m1c-wg` |
| Glue Data Catalog | Schema and partition metadata; database `hyper_intern_m1c` |
| S3 (Raw) | `hyper-intern-m1c-data/raw/` |
| S3 (Curated) | `hyper-intern-m1c-data/curated/` |
| S3 (Athena Results) | `hyper-intern-m1c-athena-results/query-results/` |
| EventBridge | Cron schedule for batch ingestion |
| SQS / DLQ | Batch Lambda failure handling |
| CloudWatch | Alarm on DLQ depth |

---

## 7. Region and Environment

- AWS Region: `ap-northeast-2` (Seoul)
- All components must be deployed in `ap-northeast-2`
- Bedrock model availability in `ap-northeast-2` must be verified before deployment
- Environment guard: `env_guard.py` enforces region and database name at startup
