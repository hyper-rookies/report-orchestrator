"use client";

import "@/lib/amplify";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchAuthSession } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true") {
      router.replace("/");
      return;
    }

    const cancelHub = Hub.listen("auth", ({ payload }) => {
      if (cancelled) return;

      if (payload.event === "signInWithRedirect" || payload.event === "signedIn") {
        router.replace("/");
      }

      if (payload.event === "signInWithRedirect_failure") {
        setError("OAuth callback failed. Redirecting to login...");
        setTimeout(() => {
          if (!cancelled) router.replace("/login");
        }, 1500);
      }
    });

    const run = async () => {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        try {
          const session = await fetchAuthSession();
          if (session.tokens?.idToken || session.tokens?.accessToken) {
            router.replace("/");
            return;
          }
        } catch (err) {
          if (attempt === 39) {
            console.error("auth callback error:", err);
            setError(
              "Session exchange failed. Verify App client settings and try again from /login."
            );
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // All attempts exhausted with no session — redirect to login
      if (!cancelled) {
        router.replace("/login");
      }
    };

    void run();

    return () => {
      cancelled = true;
      cancelHub();
    };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="space-y-3 text-center">
        <p className="text-muted-foreground">Completing sign-in...</p>
        {error ? (
          <>
            <p className="max-w-md text-sm text-destructive">{error}</p>
            <Link className="text-sm underline" href="/login">
              Back to login
            </Link>
          </>
        ) : null}
      </div>
    </div>
  );
}
