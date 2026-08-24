"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  BarChart3,
  Trophy,
  User,
  ChevronLeft,
  ChevronRight,
  Flame,
  Zap,
  CircleDollarSign,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { xpProgress, calculateLevel, getStreakMultiplier, getStreakLabel } from "@/lib/xp";
import { Avatar } from "@/components/ui/avatar";
import { ProgressBar } from "@/components/ui/progress-bar";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/rooms", label: "Study Rooms", icon: Users },
  { href: "/subjects", label: "Subjects", icon: BookOpen },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/shop", label: "Shop", icon: ShoppingCart },
  { href: "/profile", label: "Profile", icon: User },
] as const;

export interface SidebarUser {
  display_name: string;
  avatar_url: string | null;
  level: number;
  xp: number;
  coins: number;
  current_streak: number;
  equipped_title: { text: string; color: string } | null;
  equipped_badge: { icon: string; color: string } | null;
  name_effect?: string | null;
}

export interface SidebarProps {
  user?: SidebarUser | null;
  collapsed?: boolean;
  onToggle?: () => void;
  className?: string;
}

export function Sidebar({ user: initialUser, collapsed: controlledCollapsed, onToggle, className }: SidebarProps) {
  const pathname = usePathname();
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [profile, setProfile] = useState<SidebarUser | null>(initialUser ?? null);

  const collapsed = controlledCollapsed ?? internalCollapsed;
  const toggle = onToggle ?? (() => setInternalCollapsed((c) => !c));

  const refreshProfile = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("display_name, avatar_url, level, xp, coins, current_streak, equipped_title, equipped_badge")
      .eq("id", user.id)
      .single();
    if (data) {
      setProfile({
        display_name: data.display_name,
        avatar_url: data.avatar_url,
        level: data.level,
        xp: data.xp,
        coins: data.coins,
        current_streak: data.current_streak,
        equipped_title: data.equipped_title,
        equipped_badge: data.equipped_badge,
      });
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) return;

      channel = supabase.channel("sidebar-profile-" + user.id);
      channel.on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${user.id}`,
        },
        () => {
          refreshProfile();
        },
      );
      channel.subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [refreshProfile]);

  const user = profile;

  const xp = user ? xpProgress(user.xp) : null;
  const displayLevel = user ? (xp?.level ?? calculateLevel(user.xp)) : 0;

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col h-screen sticky top-0 border-r border-border bg-card transition-all duration-300",
        collapsed ? "w-[68px]" : "w-64",
        className,
      )}
    >
      <div className={cn("flex items-center border-b border-border px-4 py-4", collapsed && "justify-center px-0")}>
        {!collapsed && (
          <span className="text-lg font-bold text-primary tracking-tight">StudyTogether</span>
        )}
        <button
          onClick={toggle}
          className={cn(
            "ml-auto rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer",
            collapsed && "ml-0",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="flex flex-col gap-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    collapsed && "justify-center px-0",
                  )}
                  title={collapsed ? label : undefined}
                >
                  <Icon size={20} className="shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {user && (
        <div className={cn("border-t border-border p-4", collapsed && "px-2 py-3")}>
          <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
            <Avatar
              src={user.avatar_url}
              alt={user.display_name}
              fallback={user.display_name}
              size="sm"
              showLevelRing
              level={displayLevel}
            />
            {!collapsed && (
              <div className="flex-1 overflow-hidden">
                <p
                  className={cn(
                    "truncate text-sm font-medium text-card-foreground",
                    user.name_effect && `name-effect-${user.name_effect}`,
                  )}
                >
                  {user.display_name}
                  {user.equipped_badge && (
                    <span
                      className="ml-1"
                      style={{ color: user.equipped_badge.color }}
                    >
                      {user.equipped_badge.icon}
                    </span>
                  )}
                </p>
                {user.equipped_title && (
                  <span
                    className="block truncate text-[11px] italic leading-tight"
                    style={{ color: user.equipped_title.color }}
                  >
                    {user.equipped_title.text}
                  </span>
                )}
                <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-0.5">
                    <Zap size={10} className="text-primary" />
                    Lv. {displayLevel}
                  </span>
                  <span className="inline-flex items-center gap-0.5">
                    <Flame size={10} className="text-warning" />
                    {user.current_streak}d
                  </span>
                  <span className="inline-flex items-center gap-0.5">
                    <CircleDollarSign size={10} className="text-secondary" />
                    {user.coins}
                  </span>
                  {user.current_streak > 0 && (
                    <span className="text-primary">
                      {getStreakMultiplier(user.current_streak)}x
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
          {!collapsed && xp && (
            <>
              <ProgressBar
                value={xp.progress * 100}
                xpBar
                size="sm"
                className="mt-3"
              />
              <p className="mt-1 text-[10px] text-muted-foreground text-right">
                {xp.xpToNext} XP to Lv.{xp.level + 1}
              </p>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
