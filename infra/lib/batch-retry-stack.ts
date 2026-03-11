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
  notificationEmail: string;
  batchLambdaArn: string;
  batchLambdaRoleArn: string;
}

export class BatchRetryStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BatchRetryStackProps) {
    super(scope, id, props);

    // DLQ: retains messages after 3 failed attempts
    const dlq = new sqs.Queue(this, "BatchDLQ", {
      queueName: "batch-ingest-dlq",
      retentionPeriod: cdk.Duration.days(14),
    });

    // Retry queue: maxReceiveCount=3 then move to DLQ
    // visibilityTimeout must be >= 6x Lambda timeout (5 min * 6 = 30 min)
    const retryQueue = new sqs.Queue(this, "BatchRetryQueue", {
      queueName: "batch-ingest-retry",
      visibilityTimeout: cdk.Duration.minutes(30),
      deadLetterQueue: {
        queue: dlq,
        maxReceiveCount: 3,
      },
    });

    // Import existing Lambda with its role so CDK can grant SQS permissions
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
        batchSize: 1,
        reportBatchItemFailures: false,
      })
    );

    // EventBridge schedule: daily 03:00 KST (18:00 UTC)
    const rule = new events.Rule(this, "BatchScheduleRule", {
      ruleName: "batch-ingest-daily",
      description: "Daily batch ingest trigger at 03:00 KST (D-1 data)",
      schedule: events.Schedule.cron({ minute: "0", hour: "18" }),
    });

    rule.addTarget(
      new targets.SqsQueue(retryQueue, {
        message: events.RuleTargetInput.fromObject({
          source: "eventbridge-schedule",
        }),
      })
    );

    // SNS topic + email subscription for DLQ alerts
    const alertTopic = new sns.Topic(this, "BatchAlertTopic", {
      topicName: "batch-ingest-alerts",
      displayName: "Batch Ingest DLQ Alert",
    });

    alertTopic.addSubscription(
      new subs.EmailSubscription(props.notificationEmail)
    );

    // CloudWatch Alarm: DLQ message count >= 1 -> SNS
    const dlqAlarm = new cloudwatch.Alarm(this, "BatchDLQAlarm", {
      alarmName: "batch-ingest-dlq-messages",
      alarmDescription: "Batch ingest failed 3 times - message arrived in DLQ",
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

    new cdk.CfnOutput(this, "RetryQueueUrl", {
      value: retryQueue.queueUrl,
      description: "Batch retry queue URL",
    });

    new cdk.CfnOutput(this, "DLQUrl", {
      value: dlq.queueUrl,
      description: "Batch DLQ URL",
    });

    new cdk.CfnOutput(this, "AlertTopicArn", {
      value: alertTopic.topicArn,
      description: "Batch alert SNS topic ARN",
    });
  }
}
