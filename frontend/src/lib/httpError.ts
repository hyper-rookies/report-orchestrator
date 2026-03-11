export async function getResponseErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown; message?: unknown };
    if (typeof body.error === "string" && body.error.trim().length > 0) {
      return body.error;
    }
    if (typeof body.message === "string" && body.message.trim().length > 0) {
      return body.message;
    }
  } catch {
    // Fall through to text / fallback.
  }

  try {
    const text = (await response.text()).trim();
    if (text.length > 0 && text.length <= 240) {
      return text;
    }
  } catch {
    // Fall through to fallback.
  }

  return fallback;
}
