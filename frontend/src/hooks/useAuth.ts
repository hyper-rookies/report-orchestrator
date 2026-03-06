"use client";

import { useEffect, useState } from "react";
import {
  fetchAuthSession,
  signOut as amplifySignOut,
} from "aws-amplify/auth";

interface AuthUser {
  username: string;
  email?: string;
}

interface UseAuthResult {
  user: AuthUser | null;
  idToken: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const MOCK_USER: AuthUser = { username: "mock-user", email: "dev@example.com" };
const MOCK_TOKEN = "mock-id-token";

export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true") {
      setUser(MOCK_USER);
      setIdToken(MOCK_TOKEN);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken;
        const accessToken = session.tokens?.accessToken;

        if (!idToken || !accessToken) {
          setUser(null);
          setIdToken(null);
          return;
        }

        const usernameClaim = idToken.payload["cognito:username"];
        const emailClaim = idToken.payload.email;
        const username =
          typeof usernameClaim === "string"
            ? usernameClaim
            : typeof emailClaim === "string"
              ? emailClaim
              : "authenticated-user";

        setUser({
          username,
          ...(typeof emailClaim === "string" ? { email: emailClaim } : {}),
        });
        setIdToken(idToken.toString());
      } catch (err) {
        const errorName = err instanceof Error ? err.name : "";
        if (errorName !== "UserUnAuthenticatedException") {
          console.error("fetchAuthSession error:", err);
        }
        setUser(null);
        setIdToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signOut = async () => {
    if (process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true") {
      setUser(null);
      setIdToken(null);
      return;
    }
    await amplifySignOut();
    setUser(null);
    setIdToken(null);
  };

  return { user, idToken, loading, signOut };
}
