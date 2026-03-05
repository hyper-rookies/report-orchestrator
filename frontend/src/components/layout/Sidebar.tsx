"use client";

import Link from "next/link";
import { LayoutDashboard, MessageSquare, Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/", label: "AI 채팅", icon: MessageSquare },
];

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
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
      <nav className="space-y-1 p-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent",
              (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/")) && "bg-accent font-medium"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto p-2">{/* FE-07에서 대화 이력 추가 */}</div>
    </aside>
  );
}
