"use client";

import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const HIDDEN_PATHS = ["/login", "/signup", "/auth/callback"];

export default function LogoutButton() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, signOut } = useAuth();

  if (HIDDEN_PATHS.some((path) => pathname.startsWith(path))) {
    return null;
  }
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

