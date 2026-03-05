"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export default function Sidebar() {
  const router = useRouter();
  return (
    <aside className="flex w-60 flex-shrink-0 flex-col border-r bg-muted/30">
      <div className="border-b p-3">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={() => router.push("/")}
        >
          <Plus className="h-4 w-4" />
          새 대화
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">{/* FE-07에서 대화 이력 추가 */}</div>
    </aside>
  );
}

