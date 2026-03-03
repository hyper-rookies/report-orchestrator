# Infra Architecture — Text Source (Authoritative)

## System Boundary
- All components below are inside AWS Cloud unless explicitly marked External.

---

## Actors
- User (Unauthenticated)
- User (Authenticated)

---

## Entry Points (IMPORTANT)

### 1) API Gateway (Auth-only Entry)
- Purpose: Authentication & authorization
- Connected Authorizer: Cognito Authorizer
- DOES NOT handle SSE
- DOES NOT stream responses

### 2) Lambda Function URL (Realtime SSE Entry)
- Bound directly to Orchestrator Lambda
- Purpose: Realtime streaming (SSE)
- Authentication: pre-authenticated user only
- API Gateway is NOT in this path

---

## Authentication Flow (JWT)

1. User → API Gateway
2. API Gateway → Cognito Authorizer
3. Cognito Authorizer validates JWT
4. On success:
   - User is considered Authenticated
   - User is allowed to call Lambda Function URL directly

⚠️ API Gateway is used ONLY for authentication / token validation  
⚠️ API Gateway is NOT used for SSE or streaming

---

## Realtime Analysis Flow (SSE)

### Entry
- Authenticated User → Lambda Function URL → Orchestrator Lambda

### Response
- Protocol: Server-Sent Events (SSE)
- Event types:
  - status
  - delta
  - result

### Flow
1. Authenticated User opens SSE connection via Lambda Function URL
2. Orchestrator Lambda starts execution
3. Orchestrator Lambda → Amazon Bedrock (LLM call)
4. Amazon Bedrock ↔ Tools (tool calling)
5. Orchestrator Lambda → Athena (query execution)
6. Athena → S3 Athena Result (query output stored)
7. Orchestrator Lambda streams:
   - intermediate status
   - partial deltas
   - final result
   via SSE to the user

---

## Batch Ingestion Flow (D-1)

1. EventBridge (3AM / D-1) triggers Batch Lambda
2. Batch Lambda calls External APIs:
   - GA4
   - AppsFlyer
   - Airbridge
3. On success:
   - Data is written to S3 Raw
4. Immediately after write:
   - Glue Data Catalog partition is registered
5. Athena queries:
   - Glue Data Catalog (metadata)
   - S3 Raw (scan target)

---

## Data Stores

### S3 Raw
- Stores raw ingested data from Batch Lambda
- Partitioned (dt-based)
- Registered to Glue Data Catalog immediately after write

### Glue Data Catalog
- Holds schema & partition metadata
- Referenced by Athena

### Athena
- Query engine
- Reads from:
  - Glue Data Catalog
  - S3 Raw
- Writes results to:
  - S3 Athena Result

### S3 Athena Result
- Stores Athena query results
- Used by Orchestrator Lambda for:
  - direct read
  - metadata persistence (job-level info)

---

## Failure Handling (Batch Only)

1. Batch Lambda failure → SQS
2. Retry count > 3 → DLQ
3. DLQ event → CloudWatch Alarm

---

## Explicit Non-Goals / Exclusions

- API Gateway does NOT:
  - stream SSE
  - proxy realtime responses
- SSE does NOT:
  - pass through API Gateway
  - use HTTP chunked proxying
- Orchestrator Lambda is the ONLY SSE producer

---

## Interface Summary

- API Gateway → Cognito Authorizer : JWT validation
- Authenticated User → Lambda Function URL : SSE stream
- Orchestrator Lambda → Bedrock : LLM
- Orchestrator Lambda → Athena : Query
- Athena → S3 Athena Result : Output
- EventBridge → Batch Lambda : Schedule
- Batch Lambda → External APIs : Fetch
- Batch Lambda → S3 Raw : Persist
- S3 Raw → Glue Data Catalog : Partition registration
- Batch Lambda failure → SQS → Batch Lambda(Retry 3 times)
- SQS(fail more than 3 times) → DLQ → CloudWatch Alarm