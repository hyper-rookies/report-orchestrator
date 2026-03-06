import "aws-amplify/auth/enable-oauth-listener";
import { Amplify } from "aws-amplify";

const USER_POOL_ID = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? "";
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "";
const COGNITO_DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN ?? "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";
const USE_MOCK_AUTH = process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true";

function isConfigured(value: string): boolean {
  if (!value) return false;
  if (value.includes("XXXXX")) return false;
  if (value.includes("YOUR_")) return false;
  return true;
}

const hasCoreAuthConfig = isConfigured(USER_POOL_ID) && isConfigured(CLIENT_ID);
const hasOAuthConfig = hasCoreAuthConfig && isConfigured(COGNITO_DOMAIN) && isConfigured(APP_URL);

if (!USE_MOCK_AUTH && !hasCoreAuthConfig) {
  console.error(
    "[Amplify Auth] Missing Cognito config. Set NEXT_PUBLIC_COGNITO_USER_POOL_ID and NEXT_PUBLIC_COGNITO_CLIENT_ID."
  );
}

if (!USE_MOCK_AUTH && !hasOAuthConfig) {
  console.warn(
    "[Amplify Auth] OAuth config is incomplete. Google login needs NEXT_PUBLIC_COGNITO_DOMAIN and NEXT_PUBLIC_APP_URL."
  );
}

Amplify.configure(
  {
    Auth: {
      Cognito: {
        userPoolId: USER_POOL_ID,
        userPoolClientId: CLIENT_ID,
        loginWith: {
          email: true,
          ...(hasOAuthConfig
            ? {
                oauth: {
                  domain: COGNITO_DOMAIN,
                  scopes: ["email", "openid", "profile"],
                  redirectSignIn: [`${APP_URL}/auth/callback`],
                  redirectSignOut: [`${APP_URL}/`],
                  responseType: "code" as const,
                },
              }
            : {}),
        },
      },
    },
  },
  { ssr: true }
);
