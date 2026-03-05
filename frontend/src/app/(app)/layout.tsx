import type { ReactNode } from "react";

import Sidebar from "@/components/layout/Sidebar";
import LogoutButton from "@/components/layout/LogoutButton";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-screen overflow-hidden">
      <div className="absolute right-4 top-4 z-20">
        <LogoutButton />
      </div>
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}

