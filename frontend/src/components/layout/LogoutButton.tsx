"use client";

import { useRouter } from "next/navigation";

import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export default function LogoutButton() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();

  if (loading || !user) {
    return null;
  }

  const handleClick = async () => {
    await signOut();
    router.push("/login");
  };

  return (
    <Button variant="outline" size="sm" onClick={handleClick}>
      로그아웃
    </Button>
  );
}

