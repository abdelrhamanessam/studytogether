"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Trophy,
  User,
  ShoppingCart,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/rooms", label: "Rooms", icon: Users },
  { href: "/subjects", label: "Subjects", icon: BookOpen },
  { href: "/leaderboard", label: "Ranks", icon: Trophy },
  { href: "/shop", label: "Shop", icon: ShoppingCart },
  { href: "/profile", label: "Profile", icon: User },
] as const;

export interface MobileNavProps {
  className?: string;
}

export function MobileNav({ className }: MobileNavProps) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "md:hidden fixed inset-x-0 bottom-0 z-50 border-t border-border",
        "bg-card/90 backdrop-blur-md",
        "pb-[env(safe-area-inset-bottom)]",
        className,
      )}
    >
      <ul className="flex items-center justify-around px-0.5 pt-1 pb-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-[10px] font-medium transition-colors min-h-[44px] justify-center",
                  active
                    ? "text-primary"
                    : "text-muted-foreground active:text-foreground",
                )}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
