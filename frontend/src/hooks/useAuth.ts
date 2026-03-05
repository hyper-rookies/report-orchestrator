"use client";

import { useEffect, useState } from "react";
import {
  fetchAuthSession,
  getCurrentUser,
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
        const [cognitoUser, session] = await Promise.all([
          getCurrentUser(),
          fetchAuthSession(),
        ]);
        setUser({ username: cognitoUser.username });
        setIdToken(session.tokens?.idToken?.toString() ?? null);
      } catch (err) {
        console.error("fetchAuthSession error:", err);
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
