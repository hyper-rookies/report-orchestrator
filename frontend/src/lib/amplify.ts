import "aws-amplify/auth/enable-oauth-listener";
import { Amplify } from "aws-amplify";

Amplify.configure(
  {
    Auth: {
      Cognito: {
        userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
        userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
        loginWith: {
          email: true,
          oauth: {
            domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN!,
            scopes: ["email", "openid", "profile"],
            redirectSignIn: [
              `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
            ],
            redirectSignOut: [`${process.env.NEXT_PUBLIC_APP_URL}/`],
            responseType: "code",
          },
        },
      },
    },
  },
  { ssr: true } // cookie 기반 토큰 저장 → Edge Runtime(middleware)에서 읽기 가능
);
