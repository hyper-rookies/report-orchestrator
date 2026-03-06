"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { signIn, signInWithRedirect } from "aws-amplify/auth";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const USE_MOCK_AUTH = process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true";
const USER_POOL_ID = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? "";
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "";
const COGNITO_DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN ?? "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

function isConfigured(value: string): boolean {
  if (!value) return false;
  if (value.includes("XXXXX")) return false;
  if (value.includes("YOUR_")) return false;
  return true;
}

const HAS_CORE_AUTH_CONFIG = isConfigured(USER_POOL_ID) && isConfigured(CLIENT_ID);
const HAS_GOOGLE_AUTH_CONFIG =
  HAS_CORE_AUTH_CONFIG && isConfigured(COGNITO_DOMAIN) && isConfigured(APP_URL);

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("이메일과 비밀번호를 모두 입력해 주세요.");
      return;
    }

    if (USE_MOCK_AUTH) {
      router.push("/");
      return;
    }

    if (!HAS_CORE_AUTH_CONFIG) {
      setError(
        "Cognito 설정이 비어 있습니다. .env.local의 NEXT_PUBLIC_COGNITO_USER_POOL_ID, NEXT_PUBLIC_COGNITO_CLIENT_ID를 확인해 주세요."
      );
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const result = await signIn({ username: email.trim(), password });
      if (result.isSignedIn) {
        router.push("/");
      } else {
        setError("추가 인증이 필요한 상태입니다. 관리자 설정을 확인해 주세요.");
      }
    } catch (err) {
      console.error("signIn error:", err);
      setError("로그인에 실패했습니다. 이메일/비밀번호 또는 Cognito 설정을 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (USE_MOCK_AUTH) {
      router.push("/");
      return;
    }

    if (!HAS_GOOGLE_AUTH_CONFIG) {
      setError(
        "Google OAuth 설정이 비어 있습니다. .env.local의 NEXT_PUBLIC_COGNITO_DOMAIN, NEXT_PUBLIC_APP_URL을 확인해 주세요."
      );
      return;
    }

    setError(null);
    try {
      await signInWithRedirect({ provider: "Google" });
    } catch (err) {
      console.error("signInWithRedirect error:", err);
      setError("Google 로그인에 실패했습니다. Cognito Hosted UI/Callback URL 설정을 확인해 주세요.");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">AI 리포트</CardTitle>
          <CardDescription>마케팅 데이터 AI 분석 서비스</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs defaultValue="email" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="email">이메일 로그인</TabsTrigger>
              <TabsTrigger value="google">Google 로그인</TabsTrigger>
            </TabsList>

            <TabsContent value="email" className="space-y-4">
              <form onSubmit={handleEmailLogin} className="space-y-3">
                <Input
                  type="email"
                  placeholder="이메일"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
                <Input
                  type="password"
                  placeholder="비밀번호"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? "로그인 중..." : "로그인"}
                </Button>
              </form>
              <p className="text-center text-sm text-muted-foreground">
                계정이 없나요?{" "}
                <Link href="/signup" className="font-medium text-foreground underline">
                  회원가입
                </Link>
              </p>
            </TabsContent>

            <TabsContent value="google" className="space-y-3">
              <Button onClick={handleGoogleLogin} className="w-full" size="lg">
                Google로 계속하기
              </Button>
            </TabsContent>
          </Tabs>

          {USE_MOCK_AUTH && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700">
              현재 mock auth 모드입니다. 실제 Cognito 인증 없이 메인 화면으로 이동합니다.
            </p>
          )}

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
