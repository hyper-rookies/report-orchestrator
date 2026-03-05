"use client";

import "@/lib/amplify";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchAuthSession } from "aws-amplify/auth";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    fetchAuthSession()
      .then(() => router.replace("/"))
      .catch(() => router.replace("/login"));
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">로그인 처리 중...</p>
    </div>
  );
}
