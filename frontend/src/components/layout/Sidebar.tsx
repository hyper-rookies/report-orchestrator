"use client";

import Link from "next/link";
import { LayoutDashboard, MessageSquare, Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import SessionListItem from "@/components/layout/SessionListItem";
import { Button } from "@/components/ui/button";
import { useSessionContext } from "@/context/SessionContext";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/", label: "AI 채팅", icon: MessageSquare },
];

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { sessions } = useSessionContext();

  return (
    <aside className="flex min-h-0 w-64 flex-shrink-0 flex-col overflow-hidden border-r border-sidebar-border/90 bg-sidebar text-sidebar-foreground shadow-[8px_0_24px_-24px_rgba(25,25,25,0.45)]">
      <div className="border-b border-sidebar-border/80 px-4 py-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-sidebar-accent-foreground/80">
          NHN AD
        </p>
        <p className="mt-1 text-sm font-medium text-sidebar-foreground">Marketing Copilot</p>
      </div>

      <div className="border-b border-sidebar-border/80 p-3">
        <Button
          variant="outline"
          className="w-full justify-start gap-2 border-sidebar-primary/40 text-sidebar-primary hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => router.push("/")}
        >
          <Plus className="h-4 w-4" />
          새 대화
        </Button>
      </div>

      <nav className="space-y-1 px-2 py-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)) &&
                "bg-sidebar-accent text-sidebar-accent-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
        {sessions.length > 0 && (
          <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground">
            최근 대화
          </p>
        )}
        <div className="space-y-0.5">
          {sessions.map((session) => (
            <SessionListItem
              key={session.sessionId}
              sessionId={session.sessionId}
              title={session.title}
              isActive={pathname === `/sessions/${session.sessionId}`}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}
