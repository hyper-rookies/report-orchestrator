import { NextResponse } from "next/server";

function getErrorDetail(error: unknown): string {
  if (!(error instanceof Error)) {
    return "";
  }

  const detail = error.message.trim();
  if (!detail || detail.length > 240) {
    return "";
  }

  return detail;
}

function matchesStorageError(error: unknown, pattern: RegExp): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return pattern.test(`${error.name} ${error.message}`);
}

export function storageErrorResponse(scope: string, error: unknown): NextResponse {
  if (matchesStorageError(error, /credential|could not load credentials|resolved credential/i)) {
    return NextResponse.json(
      {
        error: `${scope} is misconfigured. AWS credentials are unavailable in the server runtime.`,
      },
      { status: 500 }
    );
  }

  if (matchesStorageError(error, /accessdenied|forbidden|not authorized|signaturedoesnotmatch/i)) {
    return NextResponse.json(
      {
        error: `${scope} request was denied by AWS. Check the deployed AWS credentials and IAM permissions for SESSION_BUCKET.`,
      },
      { status: 500 }
    );
  }

  if (matchesStorageError(error, /nosuchbucket|bucket/i)) {
    return NextResponse.json(
      {
        error: `${scope} bucket is missing or inaccessible. Check SESSION_BUCKET and bucket permissions.`,
      },
      { status: 500 }
    );
  }

  const detail = getErrorDetail(error);
  return NextResponse.json(
    {
      error: detail ? `${scope} request failed. ${detail}` : `${scope} request failed.`,
    },
    { status: 500 }
  );
}
