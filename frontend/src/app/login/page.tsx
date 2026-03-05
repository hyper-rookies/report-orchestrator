"use client";

import { signInWithRedirect } from "aws-amplify/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  const handleGoogleLogin = async () => {
    await signInWithRedirect({ provider: "Google" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">AI 리포트</CardTitle>
          <CardDescription>마케팅 데이터 AI 분석 서비스</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleGoogleLogin} className="w-full" size="lg">
            Google로 계속하기
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
