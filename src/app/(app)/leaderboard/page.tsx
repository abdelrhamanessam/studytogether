"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Trophy,
  Flame,
  Zap,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDurationShort, cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { Profile } from "@/types";

type Tab = "daily" | "weekly" | "monthly";

interface LeaderboardEntry {
  profile: Profile;
  period_xp: number;
  period_seconds: number;
  period_sessions: number;
}

export default function LeaderboardPage() {
  const [supabase] = useState(() => createClient());
  const [tab, setTab] = useState<Tab>("weekly");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const cancelledRef = useRef(false);

  const fetchLeaderboard = useCallback(async () => {
    cancelledRef.current = false;
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || cancelledRef.current) { setLoading(false); return; }
    setCurrentUserId(user.id);

    const now = new Date();
    const ranges: Record<Tab, Date> = {
      daily: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      weekly: new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - now.getDay(),
      ),
      monthly: new Date(now.getFullYear(), now.getMonth(), 1),
    };

    const startDate = ranges[tab].toISOString();

    const { data: rows } = await supabase.rpc("get_leaderboard", {
      p_start_date: startDate,
    });

    if (!rows || cancelledRef.current) {
      setEntries([]);
      setLoading(false);
      return;
    }

    const entries: LeaderboardEntry[] = rows.map((r: Record<string, unknown>) => ({
      profile: {
        id: r.id,
        username: r.username,
        display_name: r.display_name,
        avatar_url: r.avatar_url,
        level: r.level,
        xp: r.xp,
        current_streak: r.current_streak,
        equipped_badge: r.equipped_badge,
        equipped_title: r.equipped_title,
      } as Profile,
      period_xp: Number(r.period_xp ?? 0),
      period_seconds: Number(r.period_seconds ?? 0),
      period_sessions: Number(r.period_sessions ?? 0),
    }));

    setEntries(entries);
    setLoading(false);
  }, [tab, supabase]);

  useEffect(() => {
    cancelledRef.current = false;
    fetchLeaderboard();

    const channel = supabase
      .channel("leaderboard-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "study_sessions" },
        () => { fetchLeaderboard(); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "xp_transactions" },
        () => { fetchLeaderboard(); },
      )
      .subscribe();

    return () => {
      cancelledRef.current = true;
      supabase.removeChannel(channel);
    };
  }, [fetchLeaderboard, supabase]);

  function getMedal(rank: number) {
    if (rank === 0) return { icon: "🥇", color: "text-yellow-400", bg: "bg-yellow-400/10" };
    if (rank === 1) return { icon: "🥈", color: "text-gray-300", bg: "bg-gray-300/10" };
    if (rank === 2) return { icon: "🥉", color: "text-amber-600", bg: "bg-amber-600/10" };
    return null;
  }

  const tabLabels: Record<Tab, string> = {
    daily: "Today",
    weekly: "This Week",
    monthly: "This Month",
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          See how you rank against other students
        </p>
      </div>

      <div className="animate-fade-in flex items-center gap-1 rounded-xl bg-muted p-1" style={{ animationDelay: "60ms" }}>
        {(["daily", "weekly", "monthly"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer",
              tab === t
                ? "bg-primary text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tabLabels[t]}
          </button>
        ))}
      </div>

      <div className="animate-fade-in space-y-1" style={{ animationDelay: "120ms" }}>
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 text-center">
            <Trophy className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No data for this period yet
            </p>
          </div>
        ) : (
          entries.slice(0, 50).map((entry, i) => {
            const medal = getMedal(i);
            const isCurrentUser = entry.profile.id === currentUserId;
            const rank = i + 1;

            return (
              <Card
                key={entry.profile.id}
                className={cn(
                  "transition-colors",
                  isCurrentUser && "border-primary/30 bg-primary/5",
                  medal && `${medal.bg}`,
                )}
                padding="sm"
              >
                <CardContent className="flex items-center gap-4">
                  <div className="w-8 text-center">
                    {medal ? (
                      <span className="text-xl">{medal.icon}</span>
                    ) : (
                      <span className="text-sm font-bold tabular-nums text-muted-foreground">
                        {rank}
                      </span>
                    )}
                  </div>

                  <Avatar
                    src={entry.profile.avatar_url}
                    alt={entry.profile.display_name}
                    fallback={entry.profile.display_name}
                    size="md"
                    showLevelRing={rank <= 3}
                    level={entry.profile.level}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {entry.profile.display_name}
                      </span>
                      {entry.profile.equipped_badge && (
                        <span
                          className="text-sm"
                          style={{ color: entry.profile.equipped_badge.color }}
                        >
                          {entry.profile.equipped_badge.icon}
                        </span>
                      )}
                      {isCurrentUser && (
                        <Badge variant="default" size="sm">
                          You
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                      {entry.profile.equipped_title && (
                        <span
                          className="truncate italic"
                          style={{ color: entry.profile.equipped_title.color }}
                        >
                          {entry.profile.equipped_title.text}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Zap size={11} className="text-primary" />
                        Lv. {entry.profile.level}
                      </span>
                      <span className="flex items-center gap-1">
                        <Flame size={11} className="text-warning" />
                        {entry.profile.current_streak}d
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:gap-6 text-right">
                    <div className="hidden sm:block">
                      <p className="text-xs text-muted-foreground">
                        Study Time
                      </p>
                      <p className="text-sm font-semibold tabular-nums">
                        {formatDurationShort(entry.period_seconds)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">XP</p>
                      <p className="text-sm font-bold tabular-nums text-primary">
                        {entry.period_xp.toLocaleString()}
                      </p>
                    </div>
                    <div className="hidden sm:block">
                      <p className="text-xs text-muted-foreground">
                        Sessions
                      </p>
                      <p className="text-sm font-semibold tabular-nums">
                        {entry.period_sessions}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {entries.length > 0 && (() => {
        const userRank = entries.findIndex(
          (e) => e.profile.id === currentUserId,
        );
        if (userRank >= 0 && userRank < 10) return null;
        if (userRank < 0) return null;
        const entry = entries[userRank];
        const rank = userRank + 1;

        return (
          <Card
            className="animate-fade-in border-primary/30 bg-primary/5"
            padding="sm"
          >
            <CardContent className="flex items-center gap-4">
              <div className="w-8 text-center">
                <span className="text-sm font-bold tabular-nums text-muted-foreground">
                  {rank}
                </span>
              </div>
              <Avatar
                src={entry.profile.avatar_url}
                alt={entry.profile.display_name}
                fallback={entry.profile.display_name}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {entry.profile.display_name}
                  </span>
                  {entry.profile.equipped_badge && (
                    <span
                      className="text-sm"
                      style={{ color: entry.profile.equipped_badge.color }}
                    >
                      {entry.profile.equipped_badge.icon}
                    </span>
                  )}
                  <Badge variant="default" size="sm">
                    You
                  </Badge>
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                  {entry.profile.equipped_title && (
                    <span
                      className="truncate italic"
                      style={{ color: entry.profile.equipped_title.color }}
                    >
                      {entry.profile.equipped_title.text}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Zap size={11} className="text-primary" />
                    Lv. {entry.profile.level}
                  </span>
                  <span className="flex items-center gap-1">
                    <Flame size={11} className="text-warning" />
                    {entry.profile.current_streak}d
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 sm:gap-6 text-right">
                <div className="hidden sm:block">
                  <p className="text-xs text-muted-foreground">Study Time</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {formatDurationShort(entry.period_seconds)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">XP</p>
                  <p className="text-sm font-bold tabular-nums text-primary">
                    {entry.period_xp.toLocaleString()}
                  </p>
                </div>
                <div className="hidden sm:block">
                  <p className="text-xs text-muted-foreground">Sessions</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {entry.period_sessions}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
