# Bedrock Agent 콘솔 설정 가이드

IaC 자동화 전 콘솔로 먼저 구성하는 절차입니다.
설정 완료 후 각 항목의 ARN/ID를 아래 **[기록]** 란에 채워두세요 — IaC 작성 시 사용합니다.

> **최종 업데이트:** 2026-03-04 기준 (AWS 콘솔 UI 기준)

---

## 0. 전제조건

| 항목 | 내용 |
|------|------|
| AWS Region | `ap-northeast-2` |
| Bedrock 모델 | 별도 활성화 불필요 — 첫 호출 시 자동 활성화됨 (2025년부터 Model access 페이지 폐지) |
| Anthropic 첫 사용 | 처음이라면 Bedrock 콘솔에서 Anthropic 모델 호출 시 use case 입력 창이 뜰 수 있음 |
| Lambda 4개 배포 완료 | query-lambda, analysis-lambda, viz-lambda, report-orchestrator-lambda |

---

## 1. Lambda 배포

각 Lambda를 zip으로 패키징해서 콘솔에 업로드합니다.

### 1-1. query-lambda (Python 3.12)

> **주의:** `policy_guard.py`가 `reporting_policy.json`과 `catalog_discovered.json`을 읽습니다.
> 배포 패키지에 이 두 JSON 파일을 함께 포함해야 합니다.
> (`SHARED_DIR`은 `Path(__file__).resolve().parent`로 설정되어 있으므로 같은 디렉터리에 두기만 하면 됩니다.)

```bash
cd backend/services/query-lambda

# 패키징 (JSON 파일은 이미 같은 디렉터리에 있음)
zip -r ../../../dist/query-lambda.zip \
  handler.py policy_guard.py sql_builder.py \
  athena_runner.py row_mapper.py \
  reporting_policy.json catalog_discovered.json
```

```powershell
# PowerShell
Set-Location backend/services/query-lambda
New-Item -ItemType Directory -Force -Path ../../../dist | Out-Null
Compress-Archive -Force `
  -Path handler.py, policy_guard.py, sql_builder.py, `
        athena_runner.py, row_mapper.py, `
        reporting_policy.json, catalog_discovered.json `
  -DestinationPath ../../../dist/query-lambda.zip
```

콘솔 설정:
- Runtime: **Python 3.12**
- Handler: `handler.lambda_handler`
- Memory: 256 MB / Timeout: 60s
- 레이어: `boto3` 최신 버전 (Lambda 기본 포함이지만 버전이 오래됨 — AWS SDK 레이어 추가 권장)
- 환경변수:
  - `ATHENA_WORKGROUP` = `hyper-intern-m1c-wg`
  - `ATHENA_DATABASE` = `hyper_intern_m1c`
  - `ATHENA_OUTPUT_LOCATION` = `s3://hyper-intern-m1c-athena-results/query-results/`

### 1-2. analysis-lambda (Python 3.12)

```bash
cd backend/services/analysis-lambda
zip analysis-lambda.zip app.py
```

```powershell
# PowerShell
Set-Location backend/services/analysis-lambda
Compress-Archive -Force -Path app.py -DestinationPath analysis-lambda.zip
```

콘솔 설정:
- Runtime: **Python 3.12**
- Handler: `app.lambda_handler`
- Memory: 128 MB / Timeout: 30s
- 환경변수: 없음 (pure computation, 외부 의존성 없음)

### 1-3. viz-lambda (Python 3.12)

```bash
cd backend/services/viz-lambda
zip viz-lambda.zip app.py
```

```powershell
# PowerShell
Set-Location backend/services/viz-lambda
Compress-Archive -Force -Path app.py -DestinationPath viz-lambda.zip
```

콘솔 설정:
- Runtime: **Python 3.12**
- Handler: `app.lambda_handler`
- Memory: 128 MB / Timeout: 30s
- 환경변수: 없음 (pure computation, 외부 의존성 없음)

### 1-4. report-orchestrator-lambda (Node.js 22)

```bash
cd backend/services/report-orchestrator-lambda
npm ci --omit=dev
zip -r ../../../dist/orchestrator-lambda.zip src/ node_modules/ package.json
```

```powershell
# PowerShell
Set-Location backend/services/report-orchestrator-lambda
npm ci --omit=dev
New-Item -ItemType Directory -Force -Path ../../../dist | Out-Null
Compress-Archive -Force `
  -Path src, node_modules, package.json `
  -DestinationPath ../../../dist/orchestrator-lambda.zip
```

콘솔 설정:
- Runtime: **Node.js 22.x**
- Handler: `src/lambda-handler.handler`
- Memory: 256 MB / Timeout: 120s
- **응답 스트리밍 활성화:**
  Configuration → Function URL → Create function URL
  - Auth type: `NONE` (테스트용) 또는 `AWS_IAM` (프로덕션)
  - Invoke mode: **`RESPONSE_STREAM`**
- 환경변수:
  - `BEDROCK_AGENT_ID` = _(Agent 생성 후 채울 것)_
  - `BEDROCK_AGENT_ALIAS_ID` = _(Alias 생성 후 채울 것)_
  - `AWS_REGION` = `ap-northeast-2`

**[기록]**
```
query-lambda ARN:       arn:aws:lambda:ap-northeast-2:ACCOUNT:function:___________
analysis-lambda ARN:    arn:aws:lambda:ap-northeast-2:ACCOUNT:function:___________
viz-lambda ARN:         arn:aws:lambda:ap-northeast-2:ACCOUNT:function:___________
orchestrator ARN:       arn:aws:lambda:ap-northeast-2:ACCOUNT:function:___________
orchestrator URL:       https://___________.lambda-url.ap-northeast-2.on.aws/
```

---

## 2. IAM 역할 생성

### 2-1. Bedrock Agent 실행 역할

콘솔 → IAM → Roles → Create role

이름 예시: `report-orchestrator-bedrock-agent-role`

**신뢰 정책 (Trust Policy) — SourceAccount 조건 포함:**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "bedrock.amazonaws.com" },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {
        "aws:SourceAccount": "YOUR_ACCOUNT_ID"
      },
      "ArnLike": {
        "aws:SourceArn": "arn:aws:bedrock:ap-northeast-2:YOUR_ACCOUNT_ID:agent/*"
      }
    }
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
```
Bedrock Agent Role ARN: arn:aws:iam::ACCOUNT:role/___________
```

### 2-2. Lambda 실행 역할 (query-lambda)

query-lambda는 Athena 접근이 필요합니다. Lambda 실행 역할에 인라인 정책으로 추가:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "athena:StartQueryExecution",
        "athena:GetQueryExecution",
        "athena:GetQueryResults",
        "athena:StopQueryExecution"
      ],
      "Resource": [
        "arn:aws:athena:ap-northeast-2:ACCOUNT:workgroup/hyper-intern-m1c-wg"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:GetBucketLocation"],
      "Resource": [
        "arn:aws:s3:::hyper-intern-m1c-athena-results",
        "arn:aws:s3:::hyper-intern-m1c-athena-results/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["glue:GetTable", "glue:GetDatabase", "glue:GetPartitions"],
      "Resource": [
        "arn:aws:glue:ap-northeast-2:ACCOUNT:catalog",
        "arn:aws:glue:ap-northeast-2:ACCOUNT:database/hyper_intern_m1c",
        "arn:aws:glue:ap-northeast-2:ACCOUNT:table/hyper_intern_m1c/*"
      ]
    }
  ]
}
```

### 2-3. orchestrator-lambda 실행 역할

Bedrock Agent 스트리밍 호출 권한이 필요합니다:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["bedrock:InvokeAgent"],
    "Resource": "arn:aws:bedrock:ap-northeast-2:ACCOUNT:agent-alias/*/*"
  }]
}
```

---

## 3. Bedrock Agent 생성

콘솔 → Amazon Bedrock → **Agents** (좌측 메뉴) → **Create Agent**

Agent Builder 화면에서 설정:

| 항목 | 값 |
|------|-----|
| Agent name | `report-orchestrator-agent` |
| Description | `마케팅 데이터 분석 리포트 생성 에이전트` |
| Agent resource role | 2-1에서 만든 역할 선택 |
| Model | `Claude 3.7 Sonnet` → Model ID: `apac.anthropic.claude-3-7-sonnet-20250219-v1:0` |
| Session timeout | 600초 (10분) |

> **모델 선택 팁:** Agent Builder에서 모델 선택 시 "agents-optimized models" 필터가 기본 체크되어 있습니다. 전체 모델을 보려면 체크 해제 후 Claude 3.7 Sonnet 선택.

**Instructions 입력 (아래 전체 복사):**

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
2. **executeAthenaQuery** — buildSQL이 반환한 sql을 그대로 전달하여 실행 (timeoutSeconds: 30, maxRows: 10000)
3. **computeDelta** (선택) — 기간 비교가 필요한 경우, baseline과 comparison 각각 조회 후 계산
4. **buildChartSpec** — 조회된 rows로 시각화 스펙 생성

## 규칙

- SQL은 반드시 buildSQL을 통해 생성하고 executeAthenaQuery로 실행할 것. SQL을 직접 작성하지 말 것.
- buildSQL 응답의 sql 필드를 executeAthenaQuery의 sql 파라미터로 그대로 전달할 것.
- 기간 비교 시 두 번의 executeAthenaQuery를 수행한 뒤 computeDelta를 호출할 것.
- 차트가 의미없는 경우(단일 값, 텍스트 응답)에는 buildChartSpec을 호출하지 않아도 됨.
- 오류(retryable: false)가 발생하면 사용자에게 한국어로 명확히 설명하고 재시도하지 말 것.
- 모든 응답은 한국어로 작성할 것.
- 날짜를 명시하지 않으면 최근 30일을 기본 dateRange로 사용할 것.
```

**Save** 클릭 → 저장 완료 후 상단에서 Agent ID 확인

**[기록]**
```
Agent ID: ___________
```

---

## 4. Action Group 3개 등록

Agent Builder 화면 → **Action groups** 섹션 → **Add**

---

### 4-1. Action Group: query

| 항목 | 값 |
|------|-----|
| Action group name | `query` |
| Description | `GA4/AppsFlyer 데이터 SQL 생성 및 Athena 실행` |
| Action group type | **Define with function details** |
| Action group invocation | **Select an existing Lambda function** → query-lambda 선택 |

Lambda에 리소스 기반 정책 추가 확인 팝업이 뜨면 **Add** 클릭.

**Function 1: buildSQL**

Description: `SQL 쿼리를 생성합니다. 반드시 executeAthenaQuery로 실행하세요.`

| 파라미터 | 타입 | 필수 | Description |
|---------|------|:----:|-------------|
| version | String | ✓ | 항상 "v1" |
| view | String | ✓ | 조회할 뷰 이름 (allowed_views 중 하나) |
| dateRange | Object | ✓ | {"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"} |
| dimensions | Array | ✓ | 그룹핑 컬럼 목록 (예: ["channel_group"]) |
| metrics | Array | ✓ | 집계 컬럼 목록 (예: ["sessions", "conversions"]) |
| filters | Array | | [{column, op, value}] 형태의 필터 (op: =, !=, >, <, >=, <=, LIKE, IN) |
| limit | Integer | | 최대 반환 행 수. 기본값 1000, 최대 10000 |

**Function 2: executeAthenaQuery**

Description: `buildSQL이 생성한 SQL을 Athena에서 실행하고 결과 rows를 반환합니다.`

| 파라미터 | 타입 | 필수 | Description |
|---------|------|:----:|-------------|
| version | String | ✓ | 항상 "v1" |
| sql | String | ✓ | buildSQL 응답의 sql 필드 그대로 전달 |
| timeoutSeconds | Integer | ✓ | 권장: 30 |
| maxRows | Integer | ✓ | 권장: 10000 |

---

### 4-2. Action Group: analysis

| 항목 | 값 |
|------|-----|
| Action group name | `analysis` |
| Description | `두 기간의 데이터를 비교하여 증감률 계산` |
| Action group type | **Define with function details** |
| Action group invocation | **Select an existing Lambda function** → analysis-lambda 선택 |

**Function 1: computeDelta**

Description: `두 기간의 데이터를 비교하여 절대값 및 퍼센트 변화를 계산합니다.`

| 파라미터 | 타입 | 필수 | Description |
|---------|------|:----:|-------------|
| version | String | ✓ | 항상 "v1" |
| baseline | Array | ✓ | 이전 기간 rows (executeAthenaQuery 결과의 rows 필드) |
| comparison | Array | ✓ | 비교 기간 rows (executeAthenaQuery 결과의 rows 필드) |
| groupBy | Array | ✓ | 비교 기준 컬럼 목록 (예: ["channel_group"]) |
| metrics | Array | ✓ | 델타를 계산할 숫자형 컬럼 목록 (예: ["sessions"]) |

---

### 4-3. Action Group: viz

| 항목 | 값 |
|------|-----|
| Action group name | `viz` |
| Description | `데이터를 받아 차트 스펙 생성` |
| Action group type | **Define with function details** |
| Action group invocation | **Select an existing Lambda function** → viz-lambda 선택 |

**Function 1: buildChartSpec**

Description: `데이터를 받아 프론트엔드에서 렌더링 가능한 차트 스펙을 생성합니다.`

| 파라미터 | 타입 | 필수 | Description |
|---------|------|:----:|-------------|
| version | String | ✓ | 항상 "v1" |
| rows | Array | ✓ | 시각화할 데이터 rows |
| chartType | String | ✓ | "bar", "line", "table" 중 하나 |
| title | String | | 차트 제목 |
| xAxis | String | | X축 컬럼 이름 (bar/line 필수) |
| yAxis | Array | | Y축 컬럼 목록 (bar/line 필수, 예: ["sessions", "conversions"]) |

Action Group 3개 모두 추가 후 **Prepare** 버튼 클릭 (변경사항 적용).

---

## 5. Agent Alias 생성

Agent 상세 페이지 → **Aliases** 탭 → **Create alias**

| 항목 | 값 |
|------|-----|
| Alias name | `v1` |
| Description | `Production v1` |
| Associate a version | **Create a new version and associate it** |

> Alias를 만들면 Bedrock이 현재 Agent 상태의 스냅샷(Version)을 자동 생성합니다.
> 이후 Agent를 수정할 때 Alias는 구버전을 가리키므로, 새 버전을 만들고 Alias를 업데이트해야 합니다.

**[기록]**
```
Agent Alias ID:  ___________
Agent Alias ARN: arn:aws:bedrock:ap-northeast-2:ACCOUNT:agent-alias/AGENTID/ALIASID
```

---

## 6. Orchestrator Lambda 환경변수 업데이트

Lambda 콘솔 → report-orchestrator-lambda → **Configuration** → **Environment variables** → Edit

| 키 | 값 |
|----|-----|
| `BEDROCK_AGENT_ID` | 3단계에서 기록한 Agent ID |
| `BEDROCK_AGENT_ALIAS_ID` | 5단계에서 기록한 Alias ID |

---

## 7. 동작 검증

```bash
# Function URL로 SSE 스트림 테스트 (curl -N = no-buffer)
curl -N -X POST \
  -H "Content-Type: application/json" \
  -d '{"question": "지난 달 채널별 세션 수를 보여줘"}' \
  https://<FUNCTION_URL>/
```

```powershell
# PowerShell — curl.exe 사용 (Windows 10/11 기본 포함; PS의 curl 별칭 아님)
curl.exe -N -X POST `
  -H "Content-Type: application/json" `
  -d '{"question": "지난 달 채널별 세션 수를 보여줘"}' `
  https://<FUNCTION_URL>/

# 정상 흐름의 예상 이벤트 순서:
# event: meta          ← 항상 첫 번째
# event: progress      ← step: buildSQL (Starting Bedrock Agent...)
# event: progress      ← step: buildSQL (Agent: agentThinking)
# event: progress      ← step: buildSQL (Agent: agentThinking) - SQL 생성 중
# event: table         ← Athena 실행 완료, rows 포함
# event: progress      ← step: computeDelta (Data fetched. Building chart...)
# event: chart         ← viz Action Group 결과, spec 포함
# event: progress      ← step: finalizing (Agent: finalResponse)
# event: final         ← 항상 마지막 (성공 시)
```

---

## 알려진 이슈 / TODO

| 항목 | 내용 | 우선순위 |
|------|------|---------|
| ~~`policy_guard.py` 경로 문제~~ | ~~`SHARED_DIR`이 로컬 개발 환경 경로로 하드코딩됨. Lambda 배포 시 깨짐.~~ **수정 완료** — `SHARED_DIR = Path(__file__).resolve().parent`, JSON 파일을 `query-lambda/` 에 복사. | ✅ 해결 |
| query-lambda 의존성 레이어 | boto3, botocore 버전이 Lambda 기본 런타임보다 낮을 수 있음. AWS SDK Layer 추가 권장. | 🟡 Medium |
| Function URL 인증 | 현재 NONE으로 설정하면 공개 접근 가능. 프로덕션에서는 Cognito token 검증 필요. | 🟡 Medium |

---

## IaC 전환 시 필요한 정보 요약

설정 완료 후 아래 표를 채워두세요:

| 리소스 | ARN / ID |
|--------|----------|
| query-lambda ARN | |
| analysis-lambda ARN | |
| viz-lambda ARN | |
| orchestrator-lambda ARN | |
| orchestrator Function URL | |
| Bedrock Agent Role ARN | |
| Agent ID | |
| Agent Alias ID | |
| Agent Alias ARN | |
| AWS Account ID | |
