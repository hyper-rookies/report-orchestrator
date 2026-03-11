import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cwa from "aws-cdk-lib/aws-cloudwatch-actions";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

interface BatchRetryStackProps extends cdk.StackProps {
  /** 배치 실패 알림 수신 이메일 주소 */
  notificationEmail: string;
  /** 기존 Batch Lambda 함수 ARN */
  batchLambdaArn: string;
  /** 기존 Batch Lambda 실행 Role ARN — SQS 폴링 권한 부여에 필요 */
  batchLambdaRoleArn: string;
}

export class BatchRetryStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BatchRetryStackProps) {
    super(scope, id, props);

    // ── 1. DLQ (3회 실패 후 메시지 보관) ──────────────────────────────────
    const dlq = new sqs.Queue(this, "BatchDLQ", {
      queueName: "batch-ingest-dlq",
      retentionPeriod: cdk.Duration.days(14),
    });

    // ── 2. 재시도 큐 (최대 3회 → DLQ) ────────────────────────────────────
    // visibilityTimeout은 Lambda timeout(5분)의 6배 이상이어야 함
    const retryQueue = new sqs.Queue(this, "BatchRetryQueue", {
      queueName: "batch-ingest-retry",
      visibilityTimeout: cdk.Duration.minutes(30),
      deadLetterQueue: {
        queue: dlq,
        maxReceiveCount: 3, // 3회 수신 실패 → DLQ 이동
      },
    });

    // ── 3. 기존 Batch Lambda에 SQS Event Source Mapping 연결 ─────────────
    // fromFunctionArn으로 import한 함수는 CDK가 실행 Role을 알 수 없어
    // 자동 권한 부여가 불가 → Role을 별도로 import해서 직접 grant
    const batchRole = iam.Role.fromRoleArn(
      this,
      "BatchLambdaRole",
      props.batchLambdaRoleArn
    );

    const batchFn = lambda.Function.fromFunctionAttributes(
      this,
      "BatchLambda",
      { functionArn: props.batchLambdaArn, role: batchRole }
    );

    batchFn.addEventSource(
      new SqsEventSource(retryQueue, {
        batchSize: 1, // 날짜 단위 단일 작업 → 1건씩 처리
        reportBatchItemFailures: false, // 실패 시 전체 메시지 재처리 (batchSize=1이므로 동일)
      })
    );

    // ── 4. EventBridge 스케줄 → SQS (매일 03:00 KST = 18:00 UTC) ─────────
    const rule = new events.Rule(this, "BatchScheduleRule", {
      ruleName: "batch-ingest-daily",
      description: "매일 03:00 KST에 배치 적재 트리거 (D-1 데이터)",
      schedule: events.Schedule.cron({ minute: "0", hour: "18" }), // UTC
    });

    // EventBridge → SQS 메시지 body: {"target_date": "<이벤트 발생 전날 날짜>"}
    // <aws.events.event.time>은 ISO 8601 문자열 → Lambda에서 D-1로 계산
    // 단순하게 target_date를 비워두면 Lambda가 자동으로 D-1을 계산
    rule.addTarget(
      new targets.SqsQueue(retryQueue, {
        message: events.RuleTargetInput.fromObject({
          source: "eventbridge-schedule",
        }),
      })
    );

    // ── 5. SNS 토픽 + 이메일 구독 ─────────────────────────────────────────
    const alertTopic = new sns.Topic(this, "BatchAlertTopic", {
      topicName: "batch-ingest-alerts",
      displayName: "Batch Ingest DLQ Alert",
    });

    alertTopic.addSubscription(
      new subs.EmailSubscription(props.notificationEmail)
    );

    // ── 6. CloudWatch Alarm: DLQ 메시지 수 ≥ 1 → SNS ─────────────────────
    const dlqAlarm = new cloudwatch.Alarm(this, "BatchDLQAlarm", {
      alarmName: "batch-ingest-dlq-messages",
      alarmDescription:
        "배치 적재 3회 연속 실패 — DLQ에 메시지가 도착했습니다.",
      metric: dlq.metricApproximateNumberOfMessagesVisible({
        period: cdk.Duration.minutes(1),
        statistic: "Sum",
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    dlqAlarm.addAlarmAction(new cwa.SnsAction(alertTopic));

    // ── Outputs ────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "RetryQueueUrl", {
      value: retryQueue.queueUrl,
      description: "배치 재시도 큐 URL",
    });

    new cdk.CfnOutput(this, "DLQUrl", {
      value: dlq.queueUrl,
      description: "배치 DLQ URL",
    });

    new cdk.CfnOutput(this, "AlertTopicArn", {
      value: alertTopic.topicArn,
      description: "배치 알림 SNS 토픽 ARN",
    });
  }
}
