# report-orchestrator

GA4 / AppsFlyer 마케팅 데이터를 수집(Raw JSONL.GZ)하고 Parquet(Curated)으로 변환한 뒤
Athena External Table로 조회 가능하게 만드는 DDD 기반 Python 리포트 시스템.

## 핵심 특징

- Local ↔ S3 스토리지 스위치 (Port/Protocol 패턴)
- Curated Parquet 업로드 + Athena dt-파티션 자동 등록 (`ALTER TABLE ADD IF NOT EXISTS PARTITION`)
- API 계정 없이도 실행 가능한 스모크테스트 스크립트 제공 (`--dry-run`)

---

## 아키텍처 / 데이터 플로우

```text
GA4 API ──────────┐
                  ├──► Raw  (JSONL.GZ + _manifest.json)
AppsFlyer API ────┘     s3://hyper-intern-m1c-data/raw/source={src}/report={id}/dt=YYYY-MM-DD/
                              │
                              ▼  CurateAndRegisterUseCase
                         transform()  →  pyarrow Table
                              │
                              ├── S3CuratedWriter.write_parquet()
                              │    s3://hyper-intern-m1c-data/curated/{dataset_id}/dt=YYYY-MM-DD/
                              │        part-0000.parquet
                              │        _manifest.json
                              │
                              └── AthenaPartitionManager.add_partition()
                                   ALTER TABLE {db}.{table}
                                   ADD IF NOT EXISTS PARTITION (dt='YYYY-MM-DD')
                                   LOCATION 's3://.../dt=YYYY-MM-DD/';
                                        │
                                        ▼
                              Athena External Table  (dt STRING 파티션 기반 쿼리)
```

> `dt`는 Parquet 컬럼으로 저장하지 않음. 폴더 이름(`dt=YYYY-MM-DD`)으로만 관리.

---

## S3 버킷/경로 구조

```text
hyper-intern-m1c-data/
├── raw/
│   └── source={ga4|appsflyer}/
│       └── report={dataset_id}/
│           └── dt=YYYY-MM-DD/
│               ├── data.jsonl.gz
│               └── _manifest.json
└── curated/
    └── {dataset_id}/
        └── dt=YYYY-MM-DD/
            ├── part-0000.parquet
            └── _manifest.json

hyper-intern-m1c-athena-results/
└── query-results/          ← workgroup output location
```

> **콘솔 업로드 주의**
>
> - 폴더 통째 업로드 시 `curated/{dataset_id}/{dataset_id}/dt=...` 이중 경로가 생길 수 있음.
> - S3 콘솔보다 스크립트(`S3CuratedWriter`)로 업로드하는 것을 권장.

---

## 로컬 개발 / 설치

```bash
# 1. 가상환경
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

# 2. 의존성 설치 (boto3, pyarrow, google-analytics-data 등 포함)
pip install -r requirements.txt
```

API 연동이 필요한 경우 `.env.example` 복사 후 값 입력:

```bash
cp .env.example .env.local
```

```ini
# .env.local
GA4_PROPERTY_ID=123456789
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
APPSFLYER_API_TOKEN=your-token
APPSFLYER_APP_ID=your-app-id

# Athena (기본값 사용 시 생략 가능)
ATHENA_DATABASE=hyper_intern_m1c
ATHENA_WORKGROUP=hyper-intern-m1c-wg
```

---

## 실행 방법

### 계정 없을 때 — 지금 바로 실행 가능

```bash
# Parquet 변환 + S3 키 경로 계산까지만 수행. S3/Athena 호출 없음.
python scripts/e2e_curate_and_register_smoketest.py --dry-run

# 다른 dataset / 날짜 지정
python scripts/e2e_curate_and_register_smoketest.py --dry-run \
    --dataset-id appsflyer_installs_daily \
    --dt 2026-02-25
```

dry-run이 하는 일: mock raw records → `transform()` → pyarrow Table → Parquet 직렬화 → 바이트 계산
dry-run이 **하지 않는** 일: S3 `put_object`, Athena `StartQueryExecution`

---

### 계정/권한 받은 후 — Real run

AWS 자격증명 설정 (방법 중 하나):

```bash
# 환경변수
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_DEFAULT_REGION=ap-northeast-2

# 또는 ~/.aws/credentials 프로파일
```

```bash
# 실 S3 업로드 + Athena 파티션 자동 등록
python scripts/e2e_curate_and_register_smoketest.py \
    --bucket hyper-intern-m1c-data \
    --dt 2026-02-25

# Athena 설정 직접 지정 (--database / --workgroup으로 .env.local 없이도 가능)
python scripts/e2e_curate_and_register_smoketest.py \
    --bucket hyper-intern-m1c-data \
    --dt 2026-02-25 \
    --database hyper_intern_m1c \
    --workgroup hyper-intern-m1c-wg
```

필요한 IAM 권한:

- `s3:PutObject` — curated 버킷
- `athena:StartQueryExecution`, `athena:GetQueryExecution`
- `glue:GetTable`, `glue:BatchCreatePartition` — 대상 테이블

---

### 파티션만 단독 등록

```bash
python scripts/register_partition_smoketest.py \
    --dt 2026-02-25 \
    --table ga4_acquisition_daily \
    --location s3://hyper-intern-m1c-data/curated/ga4_acquisition_daily/dt=2026-02-25/
```

---

### 로컬 전체 파이프라인 (API 없이, 파일 기반)

```bash
# 1. mock raw 파일 생성 (jsonl.gz + _manifest.json)
python scripts/local_raw_smoketest.py --base-dir ./tmp/out --dt 2026-02-25

# 2. raw → curated Parquet 변환 (로컬 저장)
python scripts/local_curated_smoketest.py --base-dir ./tmp/out --dt 2026-02-25

# 2-b. S3 백엔드 + dry-run
python scripts/local_curated_smoketest.py \
    --backend s3 --s3-bucket hyper-intern-m1c-data --dry-run --dt 2026-02-25
```

---

## 데이터셋 (= Athena 테이블) 목록

| dataset_id | 소스 | 주요 컬럼 |
| --- | --- | --- |
| `ga4_acquisition_daily` | GA4 | channel_group, source, medium, sessions, total_users, conversions, total_revenue |
| `ga4_engagement_daily` | GA4 | channel_group, source, medium, engagement_rate, bounce_rate |
| `appsflyer_installs_daily` | AppsFlyer | media_source, campaign, installs, is_organic |
| `appsflyer_events_daily` | AppsFlyer | media_source, campaign, event_name, event_count, event_revenue, is_organic |
| `appsflyer_retention_daily` | AppsFlyer | media_source, campaign, retention_d1, retention_d7, retention_d30, is_organic |

모든 테이블은 `PARTITIONED BY (dt STRING)`. `dt` 컬럼은 Parquet 내부에 없음.

---

## Athena 테이블 생성 / 파티션 운영

### 테이블 생성 예시 (ga4_acquisition_daily)

```sql
CREATE EXTERNAL TABLE hyper_intern_m1c.ga4_acquisition_daily (
  channel_group STRING,
  source        STRING,
  medium        STRING,
  sessions      BIGINT,
  total_users   BIGINT,
  conversions   BIGINT,
  total_revenue DOUBLE
)
PARTITIONED BY (dt STRING)
STORED AS PARQUET
LOCATION 's3://hyper-intern-m1c-data/curated/ga4_acquisition_daily/';
```

### 파티션 운영

파티션 등록은 `AthenaPartitionManager`가 자동화 (`CurateAndRegisterUseCase` 내부).
수동 등록이 필요한 경우:

```sql
ALTER TABLE hyper_intern_m1c.ga4_acquisition_daily
ADD IF NOT EXISTS PARTITION (dt='2026-02-25')
LOCATION 's3://hyper-intern-m1c-data/curated/ga4_acquisition_daily/dt=2026-02-25/';
```

등록 확인:

```sql
SHOW PARTITIONS hyper_intern_m1c.ga4_acquisition_daily;
```

> **Workgroup 설정**: AWS 콘솔 → Athena → Workgroups → `hyper-intern-m1c-wg` →
> "Enforce workgroup settings" ON 권장 (output 버킷이 임의로 바뀌지 않도록).
> 콘솔 권한이 있는 경우에만 변경 가능.

---

## Troubleshooting

### `SHOW PARTITIONS`가 비는 경우

- `LOCATION` 경로 끝에 `/` 가 없거나 경로 오타 확인
- 콘솔 업로드 시 이중 폴더(`curated/{id}/{id}/dt=...`) 생성 여부 확인
- Parquet 파일이 실제 S3에 존재하는지 확인 후 파티션 재등록

### 콘솔 업로드로 경로가 꼬인 경우

- 올바른 경로로 파일 재업로드 후 수동 `ALTER TABLE ADD PARTITION`
- 또는 잘못된 파티션 제거: `ALTER TABLE ... DROP PARTITION (dt='...')`

### 권한 에러 (`AccessDenied` / `is not authorized`)

- S3: `s3:PutObject`, `s3:GetObject` — curated + athena-results 버킷
- Athena: `athena:StartQueryExecution`, `athena:GetQueryExecution`
- Glue Catalog 사용 시: `glue:GetTable`, `glue:BatchCreatePartition`

---

## 프로젝트 구조

```text
src/report_system/
├── domain/
│   ├── ingestion/          # 수집 도메인 모델·포트
│   ├── curation/           # CuratedWriteResult, CuratedStoragePort, PartitionRegistrarPort
│   └── shared/
├── application/
│   ├── ingestion/          # 수집 유스케이스 (BatchIngestUseCase)
│   ├── curation/           # CurateAndRegisterUseCase, REGISTRY, 5개 transformer
│   └── reporting/          # 리포트 포맷터
├── infrastructure/
│   ├── connectors/
│   │   ├── ga4/            # GA4RunReportConnector
│   │   └── appsflyer/      # AppsFlyerConnector
│   ├── persistence/        # LocalRawWriter, S3RawWriter, LocalCuratedWriter, S3CuratedWriter
│   └── athena/             # AthenaPartitionManager
├── interface/cli/
└── config/                 # Settings (pydantic), get_settings()

scripts/
├── local_raw_smoketest.py              # mock raw 파일 생성 (API 없이)
├── local_curated_smoketest.py          # raw → Parquet 변환 (local/s3 backend)
├── e2e_curate_and_register_smoketest.py # 변환 + S3 업로드 + Athena 등록 (--dry-run 지원)
└── register_partition_smoketest.py      # 파티션 단독 등록
```

## 요구사항

- Python >= 3.11
- 주요 의존성: `pyarrow`, `boto3`, `google-analytics-data`, `pydantic`, `python-dotenv`
  (모두 `requirements.txt`에 포함)
