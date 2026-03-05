import { CognitoJwtVerifier } from "aws-jwt-verify";

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID ?? "";
const CLIENT_ID = process.env.COGNITO_CLIENT_ID ?? "";
const DISABLE_AUTH = process.env.DISABLE_AUTH === "true";

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

if (!DISABLE_AUTH && (!USER_POOL_ID || !CLIENT_ID)) {
  console.error(
    "Missing Cognito auth env vars: COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID must be set."
  );
}

function getVerifier(): ReturnType<typeof CognitoJwtVerifier.create> | null {
  if (verifier) return verifier;
  if (!USER_POOL_ID || !CLIENT_ID) return null;
  verifier = CognitoJwtVerifier.create({
    userPoolId: USER_POOL_ID,
    tokenUse: "id",
    clientId: CLIENT_ID,
  });
  void verifier.hydrate();
  return verifier;
}

export async function verifyIdToken(
  authHeader: string | undefined
): Promise<{ sub: string; email: string } | null> {
  if (DISABLE_AUTH) return { sub: "local", email: "dev@local" };
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const jwtVerifier = getVerifier();
  if (!jwtVerifier) return null;

  try {
    const payload = await jwtVerifier.verify(token);
    return {
      sub: payload.sub,
      email: (payload.email as string) ?? "",
    };
  } catch (err) {
    console.warn("JWT verification failed:", err);
    return null;
  }
}
