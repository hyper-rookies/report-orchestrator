#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { BatchRetryStack } from "../lib/batch-retry-stack";

const app = new cdk.App();

const notificationEmail = app.node.tryGetContext("notificationEmail") as string;
if (!notificationEmail) {
  throw new Error(
    "notificationEmail context is required.\n" +
      "Usage: npx cdk deploy -c notificationEmail=your@email.com"
  );
}

const batchLambdaArn = app.node.tryGetContext("batchLambdaArn") as string;
if (!batchLambdaArn) {
  throw new Error(
    "batchLambdaArn context is required.\n" +
      "Usage: npx cdk deploy -c batchLambdaArn=arn:aws:lambda:ap-northeast-2:ACCOUNT:function:FUNCTION_NAME"
  );
}

const batchLambdaRoleArn = app.node.tryGetContext("batchLambdaRoleArn") as string;
if (!batchLambdaRoleArn) {
  throw new Error(
    "batchLambdaRoleArn context is required.\n" +
      "Usage: npx cdk deploy -c batchLambdaRoleArn=arn:aws:iam::ACCOUNT:role/ROLE_NAME"
  );
}

new BatchRetryStack(app, "BatchRetryStack", {
  env: { region: "ap-northeast-2" },
  synthesizer: new cdk.DefaultStackSynthesizer({
    fileAssetsBucketName: "hyper-intern-m1c-data",
    bucketPrefix: "cdk-assets/",
    generateBootstrapVersionRule: false,
  }),
  notificationEmail,
  batchLambdaArn,
  batchLambdaRoleArn,
});
