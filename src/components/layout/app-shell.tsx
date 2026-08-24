"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Sidebar, type SidebarUser } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";

export interface AppShellProps {
  children: ReactNode;
  user?: SidebarUser | null;
  className?: string;
}

export function AppShell({ children, user, className }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} />

      <main
        className={cn(
          "flex-1 overflow-y-auto pb-24 md:pb-0",
          className,
        )}
      >
        <div className="animate-fade-in mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>

      <MobileNav />
    </div>
  );
}
