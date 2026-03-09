import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

function getClient(): S3Client {
  return new S3Client({ region: process.env.AWS_REGION ?? "ap-northeast-2" });
}

function getBucket(): string {
  const bucket = process.env.SESSION_BUCKET;
  if (!bucket) {
    throw new Error("SESSION_BUCKET env var is not set.");
  }
  return bucket;
}

export async function s3GetJson<T>(key: string): Promise<T | null> {
  try {
    const response = await getClient().send(
      new GetObjectCommand({ Bucket: getBucket(), Key: key })
    );
    const body = await response.Body?.transformToString("utf-8");
    if (!body) {
      return null;
    }
    return JSON.parse(body) as T;
  } catch (error: unknown) {
    if ((error as { name?: string }).name === "NoSuchKey") {
      return null;
    }
    throw error;
  }
}

export async function s3PutJson(key: string, data: unknown): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: "application/json",
    })
  );
}

export async function s3Delete(key: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: getBucket(), Key: key })
  );
}

export const indexKey = (sub: string) => `sessions/${sub}/index.json`;
export const sessionKey = (sub: string, id: string) => `sessions/${sub}/${id}.json`;
