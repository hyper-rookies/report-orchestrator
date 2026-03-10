import type { ReactNode } from "react";

import Sidebar from "@/components/layout/Sidebar";
import LogoutButton from "@/components/layout/LogoutButton";
import { SessionProvider } from "@/context/SessionContext";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <div className="fixed inset-0 z-0 flex overflow-hidden nhn-subtle-grid">
        <div className="pointer-events-none absolute -left-16 -top-16 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(171,176,177,0.16),_transparent_70%)]" />
        <div className="pointer-events-none absolute -bottom-24 -right-12 h-80 w-80 rounded-full bg-[radial-gradient(circle,_rgba(171,176,177,0.14),_transparent_70%)]" />
        <div className="absolute right-4 top-4 z-20">
          <LogoutButton />
        </div>
        <Sidebar />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background/70 backdrop-blur-sm">
          {children}
        </main>
      </div>
    </SessionProvider>
  );
}

