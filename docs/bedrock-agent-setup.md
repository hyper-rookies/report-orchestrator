# Bedrock Agent 콘솔 설정 가이드

IaC 자동화 전 콘솔로 먼저 구성하는 절차입니다.
설정 완료 후 각 항목의 ARN/ID를 아래 **[기록]** 란에 채워두세요 — IaC 작성 시 사용합니다.

---

## 0. 전제조건

| 항목 | 값 |
|------|-----|
| AWS Region | `ap-northeast-2` |
| Bedrock 모델 가용성 | 콘솔 → Bedrock → Model access → `Claude 3.5 Sonnet` 활성화 확인 |
| Lambda 4개 배포 완료 | query-lambda, analysis-lambda, viz-lambda, report-orchestrator-lambda |

---

## 1. Lambda 배포

각 Lambda를 zip으로 패키징해서 콘솔에 업로드합니다.

### 1-1. query-lambda (Python 3.12)

```bash
cd backend/services/query-lambda
zip -r ../../../dist/query-lambda.zip .
```

콘솔 설정:
- Runtime: Python 3.12
- Handler: `handler.lambda_handler`
- Memory: 256 MB / Timeout: 60s
- 환경변수:
  - `ATHENA_WORKGROUP` = `hyper-intern-m1c-wg`
  - `ATHENA_DATABASE` = `hyper_intern_m1c`
  - `ATHENA_OUTPUT_LOCATION` = `s3://hyper-intern-m1c-athena-results/query-results/`

### 1-2. analysis-lambda (Python 3.12)

```bash
cd backend/services/analysis-lambda
zip app.zip app.py
```

콘솔 설정:
- Runtime: Python 3.12
- Handler: `app.lambda_handler`
- Memory: 128 MB / Timeout: 30s
- 환경변수: 없음 (pure computation)

### 1-3. viz-lambda (Python 3.12)

```bash
cd backend/services/viz-lambda
zip app.zip app.py
```

콘솔 설정:
- Runtime: Python 3.12
- Handler: `app.lambda_handler`
- Memory: 128 MB / Timeout: 30s
- 환경변수: 없음 (pure computation)

### 1-4. report-orchestrator-lambda (Node.js 22)

```bash
cd backend/services/report-orchestrator-lambda
npm ci --omit=dev
zip -r ../../../dist/orchestrator-lambda.zip src/ node_modules/ package.json
```

콘솔 설정:
- Runtime: Node.js 22.x
- Handler: `src/lambda-handler.handler`
- Memory: 256 MB / Timeout: 120s
- **응답 스트리밍 활성화**: Configuration → Function URL → Auth type: NONE (또는 IAM) → Invoke mode: **RESPONSE_STREAM**
- 환경변수:
  - `BEDROCK_AGENT_ID` = _(Agent 생성 후 채울 것)_
  - `BEDROCK_AGENT_ALIAS_ID` = _(Alias 생성 후 채울 것)_
  - `AWS_REGION` = `ap-northeast-2`

**[기록]**
- query-lambda ARN: `arn:aws:lambda:ap-northeast-2:ACCOUNT:function:___________`
- analysis-lambda ARN: `arn:aws:lambda:ap-northeast-2:ACCOUNT:function:___________`
- viz-lambda ARN: `arn:aws:lambda:ap-northeast-2:ACCOUNT:function:___________`
- orchestrator-lambda ARN: `arn:aws:lambda:ap-northeast-2:ACCOUNT:function:___________`
- orchestrator Function URL: `https://___________.lambda-url.ap-northeast-2.on.aws/`

---

## 2. IAM 역할 생성

### 2-1. Bedrock Agent 실행 역할

이름 예시: `report-orchestrator-bedrock-agent-role`

**신뢰 정책 (Trust Policy):**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "bedrock.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
```

**권한 정책 — Lambda 호출:**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "lambda:InvokeFunction",
    "Resource": [
      "arn:aws:lambda:ap-northeast-2:ACCOUNT:function:query-lambda",
      "arn:aws:lambda:ap-northeast-2:ACCOUNT:function:analysis-lambda",
      "arn:aws:lambda:ap-northeast-2:ACCOUNT:function:viz-lambda"
    ]
  }]
}
```

**[기록]**
- Bedrock Agent Role ARN: `arn:aws:iam::ACCOUNT:role/___________`

### 2-2. Lambda 실행 역할 (query-lambda)

query-lambda는 Athena 접근이 필요합니다. 기존 Lambda 실행 역할에 아래 정책을 추가하세요:

```json
{
  "Effect": "Allow",
  "Action": [
    "athena:StartQueryExecution",
    "athena:GetQueryExecution",
    "athena:GetQueryResults",
    "athena:StopQueryExecution"
  ],
  "Resource": "*"
},
{
  "Effect": "Allow",
  "Action": ["s3:PutObject", "s3:GetObject"],
  "Resource": "arn:aws:s3:::hyper-intern-m1c-athena-results/*"
},
{
  "Effect": "Allow",
  "Action": ["glue:GetTable", "glue:GetDatabase"],
  "Resource": "*"
}
```

### 2-3. orchestrator-lambda 실행 역할

Bedrock Agent 호출 권한이 필요합니다:

```json
{
  "Effect": "Allow",
  "Action": ["bedrock:InvokeAgent"],
  "Resource": "arn:aws:bedrock:ap-northeast-2:ACCOUNT:agent-alias/*/*"
}
```

---

## 3. Bedrock Agent 생성

콘솔 → Amazon Bedrock → Agents → Create agent

| 필드 | 값 |
|------|----|
| Agent name | `report-orchestrator-agent` |
| Description | `마케팅 데이터 분석 리포트 생성 에이전트` |
| IAM role | 2-1에서 만든 역할 |
| Model | `Claude 3.5 Sonnet` (anthropic.claude-3-5-sonnet-20241022-v2:0) |
| Idle session timeout | 600초 |

**Instructions (Agent 시스템 프롬프트):**

```
당신은 하이퍼 로키즈 UA팀의 마케팅 데이터 분석 에이전트입니다.
사용자의 자연어 질문을 받아 GA4 및 AppsFlyer 데이터를 분석하고 리포트를 생성합니다.

## 사용 가능한 데이터 소스

| 뷰 이름 | 데이터 소스 | 주요 지표 |
|---------|------------|----------|
| v_latest_ga4_acquisition_daily | GA4 | sessions, total_users, conversions, total_revenue |
| v_latest_ga4_engagement_daily | GA4 | engagement_rate, bounce_rate |
| v_latest_appsflyer_installs_daily | AppsFlyer | installs, media_source, campaign |
| v_latest_appsflyer_events_daily | AppsFlyer | event_count, event_revenue, event_name |

## 표준 분석 흐름

1. **buildSQL** — 사용자 의도에 맞는 SQL 생성 (view, dateRange, dimensions, metrics, filters 지정)
2. **executeAthenaQuery** — buildSQL이 반환한 sql을 그대로 전달하여 실행
   - timeoutSeconds: 30, maxRows: 10000
3. **computeDelta** (선택) — 기간 비교가 필요한 경우, baseline과 comparison 두 번 조회 후 계산
4. **buildChartSpec** — 조회된 rows로 시각화 스펙 생성

## 규칙

- SQL은 반드시 buildSQL을 통해 생성하고 executeAthenaQuery로 실행할 것. SQL을 직접 작성하지 말 것.
- buildSQL 응답의 sql 필드를 executeAthenaQuery의 sql 파라미터로 그대로 전달할 것.
- 기간 비교 시 두 번의 executeAthenaQuery를 수행한 뒤 computeDelta를 호출할 것.
- 차트가 의미없는 경우(단일 값, 텍스트 응답)에는 buildChartSpec을 호출하지 않아도 됨.
- 오류가 발생하면 사용자에게 명확히 설명하고 재시도하지 말 것 (retryable: false인 경우).
- 모든 응답은 한국어로 작성할 것.
- 날짜를 명시하지 않으면 "최근 30일"을 기본 dateRange로 사용할 것.
```

**[기록]**
- Agent ID: `___________`

---

## 4. Action Group 3개 등록

각 Action Group은 Agent 상세 페이지 → Action groups → Add 에서 추가합니다.

---

### 4-1. Action Group: query

| 필드 | 값 |
|------|----|
| Action group name | `query` |
| Action group type | Define with function details |
| Lambda function | query-lambda ARN |

**Function 1: buildSQL**

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| version | string | yes | 항상 "v1" |
| view | string | yes | 사용 가능한 뷰 이름 |
| dateRange | object | yes | {"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"} |
| dimensions | array | yes | 그룹핑 컬럼 목록 |
| metrics | array | yes | 집계 컬럼 목록 |
| filters | array | no | [{column, op, value}] 형태의 필터 |
| limit | integer | no | 기본값 1000, 최대 10000 |

Description: `SQL 쿼리를 생성합니다. 반드시 executeAthenaQuery로 실행하세요.`

**Function 2: executeAthenaQuery**

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| version | string | yes | 항상 "v1" |
| sql | string | yes | buildSQL이 반환한 sql 그대로 전달 |
| timeoutSeconds | integer | yes | 권장: 30 |
| maxRows | integer | yes | 최대 10000 |

Description: `buildSQL이 생성한 SQL을 Athena에서 실행하고 결과 rows를 반환합니다.`

---

### 4-2. Action Group: analysis

| 필드 | 값 |
|------|----|
| Action group name | `analysis` |
| Action group type | Define with function details |
| Lambda function | analysis-lambda ARN |

**Function 1: computeDelta**

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| version | string | yes | 항상 "v1" |
| baseline | array | yes | 이전 기간 rows (executeAthenaQuery 결과) |
| comparison | array | yes | 비교 기간 rows (executeAthenaQuery 결과) |
| groupBy | array | yes | 정렬 기준 컬럼 목록 |
| metrics | array | yes | 델타를 계산할 숫자형 컬럼 목록 |

Description: `두 기간의 데이터를 비교하여 절대값 및 퍼센트 변화를 계산합니다.`

---

### 4-3. Action Group: viz

| 필드 | 값 |
|------|----|
| Action group name | `viz` |
| Action group type | Define with function details |
| Lambda function | viz-lambda ARN |

**Function 1: buildChartSpec**

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| version | string | yes | 항상 "v1" |
| rows | array | yes | 시각화할 데이터 rows |
| chartType | string | yes | "bar", "line", "table" 중 하나 |
| title | string | no | 차트 제목 |
| xAxis | string | no | X축 컬럼 (bar/line 필수) |
| yAxis | array | no | Y축 컬럼 목록 (bar/line 필수) |

Description: `데이터를 받아 프론트엔드에서 렌더링 가능한 차트 스펙을 생성합니다.`

---

## 5. Agent Alias 생성

Agent 상세 → Aliases → Create alias

| 필드 | 값 |
|------|----|
| Alias name | `v1` |
| Description | `Production v1` |
| Version | Create new version |

**[기록]**
- Agent Alias ID: `___________`
- Agent Alias ARN: `arn:aws:bedrock:ap-northeast-2:ACCOUNT:agent-alias/AGENTID/ALIASID`

---

## 6. Orchestrator Lambda 환경변수 업데이트

report-orchestrator-lambda → Configuration → Environment variables:

| 키 | 값 |
|----|-----|
| `BEDROCK_AGENT_ID` | 3단계에서 기록한 Agent ID |
| `BEDROCK_AGENT_ALIAS_ID` | 5단계에서 기록한 Alias ID |

---

## 7. 동작 검증

```bash
# Function URL로 SSE 스트림 테스트
curl -N -X POST \
  -H "Content-Type: application/json" \
  -d '{"question": "지난 달 채널별 세션 수를 보여줘"}' \
  https://<FUNCTION_URL>/

# 예상 이벤트 순서:
# event: meta
# event: progress (buildSQL)
# event: progress (agentThinking)
# event: table
# event: progress (computeDelta)
# event: chart
# event: progress (finalizing)
# event: final
```

---

## IaC 전환 시 필요한 정보 요약

| 리소스 | 식별자 |
|--------|--------|
| query-lambda ARN | |
| analysis-lambda ARN | |
| viz-lambda ARN | |
| orchestrator-lambda ARN | |
| orchestrator Function URL | |
| Bedrock Agent Role ARN | |
| Agent ID | |
| Agent Alias ID | |
| Agent Alias ARN | |
