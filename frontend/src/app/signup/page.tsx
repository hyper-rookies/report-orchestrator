"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { confirmSignUp, resendSignUpCode, signUp } from "aws-amplify/auth";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
      setError("이메일과 비밀번호를 모두 입력해주세요.");
      return;
    }
    if (password !== confirmPassword) {
      setError("비밀번호와 비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const result = await signUp({
        username: email.trim(),
        password,
        options: {
          userAttributes: { email: email.trim() },
        },
      });
      if (result.isSignUpComplete) {
        router.push("/login");
      } else {
        setStep(2);
      }
    } catch (err) {
      console.error("signUp error:", err);
      setError("회원가입에 실패했습니다. 입력값을 확인하고 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError("이메일 인증 코드를 입력해주세요.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await confirmSignUp({ username: email.trim(), confirmationCode: code.trim() });
      router.push("/login");
    } catch (err) {
      console.error("confirmSignUp error:", err);
      setError("인증 코드 확인에 실패했습니다. 코드를 다시 확인해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">회원가입</CardTitle>
          <CardDescription>
            {step === 1 ? "이메일 계정을 생성합니다." : "이메일 인증 코드를 입력해주세요."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 1 ? (
            <form className="space-y-3" onSubmit={handleSignUp}>
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
              <Input
                type="password"
                placeholder="비밀번호 확인"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "가입 처리 중..." : "가입하기"}
              </Button>
            </form>
          ) : (
            <form className="space-y-3" onSubmit={handleConfirm}>
              <Input
                inputMode="numeric"
                maxLength={6}
                placeholder="6자리 인증 코드"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={loading}
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "확인 중..." : "확인"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={loading}
                onClick={async () => {
                  try {
                    await resendSignUpCode({ username: email.trim() });
                  } catch (err) {
                    console.error("resendSignUpCode error:", err);
                    setError("코드 재발송에 실패했습니다. 잠시 후 다시 시도해주세요.");
                  }
                }}
              >
                코드 재발송
              </Button>
            </form>
          )}

          {error && (
            <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

