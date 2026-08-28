"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Clock,
  Flame,
  Zap,
  Target,
  Trophy,
  Loader2,
  Award,
  TrendingUp,
  CheckCircle2,
  XCircle,
  LogOut,
  EyeOff,
  Globe,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import {
  formatDuration,
  formatDurationShort,
  cn,
} from "@/lib/utils";
import { xpProgress } from "@/lib/xp";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ProgressBar } from "@/components/ui/progress-bar";
import type {
  Profile,
  Achievement,
  XpTransaction,
} from "@/types";

interface EnrichedAchievement extends Achievement {
  unlocked: boolean;
  unlocked_at: string | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [achievements, setAchievements] = useState<EnrichedAchievement[]>([]);
  const [xpHistory, setXpHistory] = useState<XpTransaction[]>([]);
  const [recentActivity, setRecentActivity] = useState<
    { type: string; description: string; created_at: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [goalSaving, setGoalSaving] = useState(false);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [goalValue, setGoalValue] = useState<number>(0);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    router.push("/login");
  }, [supabase, router]);

  useEffect(() => {
    let cancelled = false;
    async function fetchProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) { setLoading(false); return; }

      await supabase.rpc("check_and_award_achievements", { p_user_id: user.id });

      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (cancelled) return;
      setProfile(prof);
      setGoalValue(prof.daily_goal_seconds ?? 0);

      const { data: allAchievements } = await supabase
        .from("achievements")
        .select("*");

      const { data: userAchievements } = await supabase
        .from("user_achievements")
        .select("*, achievements(*)")
        .eq("user_id", user.id);

      if (cancelled) return;

      const unlockedIds = new Set(
        (userAchievements ?? []).map((ua) => ua.achievement_id),
      );
      const unlockedMap = new Map(
        (userAchievements ?? []).map((ua) => [
          ua.achievement_id,
          ua.unlocked_at,
        ]),
      );

      const enrichedAch: EnrichedAchievement[] = (allAchievements ?? []).map(
        (a) => ({
          ...a,
          unlocked: unlockedIds.has(a.id),
          unlocked_at: unlockedMap.get(a.id) ?? null,
        }),
      );
      enrichedAch.sort((a, b) => {
        if (a.unlocked && !b.unlocked) return -1;
        if (!a.unlocked && b.unlocked) return 1;
        return 0;
      });
      setAchievements(enrichedAch);

      const { data: xpTx } = await supabase
        .from("xp_transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (cancelled) return;
      setXpHistory(xpTx ?? []);

      const { data: sessions } = await supabase
        .from("study_sessions")
        .select("*, subjects(name)")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(10);

      const activities: { type: string; description: string; created_at: string }[] =
        (sessions ?? []).map((s: Record<string, unknown>) => {
          const subjectName = (s.subjects as { name: string } | null)?.name;
          return {
            type: "study_session",
            description: `Studied${subjectName ? ` ${subjectName}` : ""} for ${formatDurationShort(s.actual_duration as number)}`,
            created_at: s.started_at as string,
          };
        });
      setRecentActivity(activities);

      setLoading(false);
    }
    fetchProfile();
    return () => { cancelled = true; };
  }, [supabase]);

  async function saveGoal(seconds: number) {
    setGoalSaving(true);
    await supabase.rpc("set_daily_goal", { p_user_id: profile!.id, p_seconds: seconds });
    setProfile((p) => p ? { ...p, daily_goal_seconds: seconds, daily_goal_state: null } : p);
    setGoalSaving(false);
  }

  async function togglePrivacy(value: boolean) {
    if (!profile) return;
    setPrivacySaving(true);
    await supabase
      .from("profiles")
      .update({ is_private: value })
      .eq("id", profile.id);
    setProfile((p) => (p ? { ...p, is_private: value } : p));
    setPrivacySaving(false);
  }

  const xp = profile
    ? xpProgress(profile.xp)
    : null;

  const xpBarData = (() => {
    if (xpHistory.length === 0) return [];
    const sorted = [...xpHistory].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    let cumulative = 0;
    return sorted.map((tx) => {
      cumulative += tx.amount;
      return {
        date: new Date(tx.created_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        xp: cumulative,
      };
    });
  })();

  const statCards = profile
    ? [
        {
          label: "Study Time",
          value: formatDuration(profile.total_study_seconds),
          icon: Clock,
          color: "text-primary",
        },
        {
          label: "Current Streak",
          value: `${profile.current_streak} days`,
          icon: Flame,
          color: "text-warning",
        },
        {
          label: "Longest Streak",
          value: `${profile.longest_streak} days`,
          icon: Target,
          color: "text-success",
        },
        {
          label: "Total XP",
          value: profile.xp.toLocaleString(),
          icon: Zap,
          color: "text-accent",
        },
      ]
    : [];

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Profile not found
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="animate-fade-in overflow-visible">
        <CardContent className="flex flex-col items-center gap-6 pt-2 sm:flex-row sm:items-start">
          <div className="relative">
            <Avatar
              src={profile.avatar_url}
              alt={profile.display_name}
              fallback={profile.display_name}
              size="xl"
              showLevelRing
              level={profile.level}
            />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-2xl font-bold tracking-tight">
              {profile.display_name}
            </h1>
            {(profile.equipped_title || profile.equipped_badge) && (
              <div className="mt-0.5 flex items-center justify-center gap-1.5 sm:justify-start">
                {profile.equipped_badge && (
                  <span style={{ color: profile.equipped_badge.color }}>
                    {profile.equipped_badge.icon}
                  </span>
                )}
                {profile.equipped_title && (
                  <span
                    className="text-sm italic"
                    style={{ color: profile.equipped_title.color }}
                  >
                    {profile.equipped_title.text}
                  </span>
                )}
              </div>
            )}
            <p className="mt-0.5 text-sm text-muted-foreground">
              @{profile.username}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
              <Badge variant="default" size="md">
                <Zap size={12} className="mr-1" />
                Level {profile.level}
              </Badge>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar size={12} />
                Joined{" "}
                {new Date(profile.created_at).toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>
            {xp && (
              <div className="mt-4 max-w-sm">
                <ProgressBar
                  value={xp.progress * 100}
                  xpBar
                  size="md"
                  showPercentage
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {xp.xpToNext.toLocaleString()} XP to Level {xp.level + 1}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card
              key={stat.label}
              className="animate-fade-in"
              style={{ animationDelay: `${(i + 1) * 60}ms` }}
            >
              <CardContent className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <Icon size={18} className={stat.color} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {stat.label}
                  </p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums">
                    {stat.value}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="animate-fade-in" style={{ animationDelay: "260ms" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target size={16} />
            Daily Study Goal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Set a daily target. Hit it for an XP boost, miss it for a penalty.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {[0, 1800, 3600, 5400, 7200, 10800, 14400, 18000, 21600].map((sec) => {
              const hours = sec / 3600;
              const active = goalValue === sec;
              return (
                <button
                  key={sec}
                  onClick={() => { setGoalValue(sec); saveGoal(sec); }}
                  disabled={goalSaving}
                  className={cn(
                    "rounded-xl px-4 py-2.5 text-sm font-medium transition-all border cursor-pointer disabled:opacity-50",
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                      : "border-border bg-muted/50 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                  )}
                >
                  {sec === 0 ? "Off" : `${hours}h`}
                </button>
              );
            })}
          </div>
          {goalValue > 0 && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-emerald-500">On Target</p>
                  <p className="text-muted-foreground mt-0.5">
                    {goalValue <= 1800 && "1.1x XP boost for 1h"}
                    {goalValue > 1800 && goalValue <= 3600 && "1.2x XP boost for 1.5h"}
                    {goalValue > 3600 && goalValue <= 7200 && "1.3x XP boost for 2h"}
                    {goalValue > 7200 && goalValue <= 10800 && "1.4x XP boost for 2.5h"}
                    {goalValue > 10800 && goalValue <= 14400 && "1.5x XP boost for 3h"}
                    {goalValue > 14400 && goalValue <= 18000 && "1.6x XP boost for 3.5h"}
                    {goalValue > 18000 && goalValue <= 21600 && "1.7x XP boost for 4h"}
                    {goalValue > 21600 && "2.0x XP boost for 4h"}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                <XCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-red-500">Missed Target</p>
                  <p className="text-muted-foreground mt-0.5">
                    {goalValue <= 1800 && "10% less XP for 30 min"}
                    {goalValue > 1800 && goalValue <= 3600 && "15% less XP for 30 min"}
                    {goalValue > 3600 && goalValue <= 7200 && "20% less XP for 30 min"}
                    {goalValue > 7200 && goalValue <= 10800 && "25% less XP for 30 min"}
                    {goalValue > 10800 && goalValue <= 14400 && "30% less XP for 30 min"}
                    {goalValue > 14400 && goalValue <= 18000 && "35% less XP for 30 min"}
                    {goalValue > 18000 && goalValue <= 21600 && "40% less XP for 30 min"}
                    {goalValue > 21600 && "50% less XP for 30 min"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="animate-fade-in" style={{ animationDelay: "280ms" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <EyeOff size={16} />
            Profile Privacy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Private profiles are hidden from the public leaderboard and other
            people can't see your study hours. Only you see your own rank.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {[false, true].map((priv) => {
              const active = profile?.is_private === priv;
              return (
                <button
                  key={String(priv)}
                  onClick={() => togglePrivacy(priv)}
                  disabled={privacySaving}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all border cursor-pointer disabled:opacity-50",
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                      : "border-border bg-muted/50 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                  )}
                >
                  {priv ? <EyeOff size={15} /> : <Globe size={15} />}
                  {priv ? "Private" : "Public"}
                </button>
              );
            })}
          </div>
          {profile?.is_private && (
            <p className="mt-3 text-xs text-muted-foreground">
              Your profile is currently private.
            </p>
          )}
        </CardContent>
      </Card>

      {xpBarData.length > 0 && (
        <Card
          className="animate-fade-in"
          style={{ animationDelay: "300ms" }}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp size={16} />
              XP History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={xpBarData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#2a2a38"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#8b8ba0", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: "#8b8ba0", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1a1a24",
                      border: "1px solid #2a2a38",
                      borderRadius: "12px",
                      color: "#e8e8ed",
                      fontSize: "12px",
                    }}
                    formatter={(value) => [
                      `${Number(value)} XP`,
                      "Cumulative XP",
                    ]}
                  />
                  <Bar
                    dataKey="xp"
                    fill="#7c6cf7"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="animate-fade-in" style={{ animationDelay: "360ms" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy size={16} />
            Achievements
          </CardTitle>
        </CardHeader>
        <CardContent>
          {achievements.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No achievements available yet
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {achievements.map((ach) => (
                <div
                  key={ach.id}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-4 transition-colors",
                    ach.unlocked
                      ? "border-primary/20 bg-primary/5"
                      : "border-border bg-muted/50 opacity-50",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg",
                      ach.unlocked ? "bg-primary/15" : "bg-muted",
                    )}
                  >
                    {ach.unlocked ? (
                      <Award size={20} className="text-primary" />
                    ) : (
                      <Award size={20} className="text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        ach.unlocked
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {ach.name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {ach.description}
                    </p>
                    {ach.unlocked && ach.unlocked_at && (
                      <p className="mt-1 text-xs text-primary">
                        Unlocked{" "}
                        {new Date(ach.unlocked_at).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric" },
                        )}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="animate-fade-in" style={{ animationDelay: "420ms" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock size={16} />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No recent activity. Start a study session!
            </p>
          ) : (
            <div className="space-y-2">
              {recentActivity.map((activity, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Clock size={14} className="text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">
                      {activity.description}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(
                        activity.created_at,
                      ).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-center pt-2 pb-8">
        <Button
          variant="outline"
          onClick={handleLogout}
          className="gap-2 text-danger hover:bg-danger/10 hover:text-danger hover:border-danger/30"
        >
          <LogOut size={16} />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
