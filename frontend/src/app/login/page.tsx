"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { signIn, signInWithRedirect } from "aws-amplify/auth";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("이메일과 비밀번호를 모두 입력해주세요.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await signIn({ username: email.trim(), password });
      if (result.isSignedIn) {
        router.push("/");
      } else {
        setError("추가 인증이 필요합니다. 관리자에게 문의해주세요.");
      }
    } catch (err) {
      console.error("signIn error:", err);
      setError("로그인에 실패했습니다. 이메일/비밀번호를 확인해주세요.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    try {
      await signInWithRedirect({ provider: "Google" });
    } catch (err) {
      console.error("signInWithRedirect error:", err);
      setError("Google 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.");
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
              <TabsTrigger value="email">이메일로 로그인</TabsTrigger>
              <TabsTrigger value="google">Google로 로그인</TabsTrigger>
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

