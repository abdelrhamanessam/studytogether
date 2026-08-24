"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Play,
  Plus,
  Trophy,
  Flame,
  Clock,
  Zap,
  BookOpen,
  ArrowRight,
  Users,
  Timer,
  Medal,
  Award,
  Star,
  Target,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { xpProgress, getStreakMultiplier, getStreakLabel } from "@/lib/xp";
import { formatDuration } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Badge } from "@/components/ui/badge";
import type { Profile, Subject, StudySession, RoomMember, Achievement, UserAchievement } from "@/types";

interface SubjectProgress extends Subject {
  completed_lessons: number;
}

interface DashboardData {
  profile: Profile | null;
  todayStudySeconds: number;
  todayXp: number;
  roomMember: (RoomMember & { rooms: { name: string } | null }) | null;
  subjectProgress: SubjectProgress[];
  recentSessions: StudySession[];
  leaderboardRank: number;
  achievements: UserAchievement[];
  totalAchievements: number;
}

const RARITY_COLORS: Record<string, string> = {
  common: "text-muted-foreground border-muted",
  uncommon: "text-emerald-500 border-emerald-500/30",
  rare: "text-blue-500 border-blue-500/30",
  epic: "text-purple-500 border-purple-500/30",
  legendary: "text-amber-500 border-amber-500/30",
};

const CATEGORY_ICONS: Record<string, typeof Trophy> = {
  streak: Flame,
  study_time: Clock,
  sessions: Timer,
  level: Star,
  xp: Zap,
};

const CATEGORY_LABELS: Record<string, string> = {
  streak: "Streaks",
  study_time: "Study Time",
  sessions: "Sessions",
  level: "Level",
  xp: "XP",
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({
    profile: null,
    todayStudySeconds: 0,
    todayXp: 0,
    roomMember: null,
    subjectProgress: [],
    recentSessions: [],
    leaderboardRank: 0,
    achievements: [],
    totalAchievements: 25,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
      const supabase = createClient();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayIso = today.toISOString();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const [profileRes, sessionsRes, xpRes, roomRes, subjectsRes, leaderboardRes, recentSessionsRes, achievementsRes, totalAchievementsRes] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single(),

          supabase
            .from("study_sessions")
            .select("actual_duration, started_at")
            .eq("user_id", user.id)
            .gte("started_at", todayIso)
            .eq("status", "completed"),

          supabase
            .from("xp_transactions")
            .select("amount")
            .eq("user_id", user.id)
            .gte("created_at", todayIso),

          supabase
            .from("room_members")
            .select("*, rooms(name)")
            .eq("user_id", user.id)
            .in("status", ["idle", "focusing", "break"])
            .limit(1)
            .maybeSingle(),

          supabase
            .from("subjects")
            .select("*, lessons(status)")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(5),

          supabase
            .from("profiles")
            .select("id")
            .order("xp", { ascending: false }),

          supabase
            .from("study_sessions")
            .select("*")
            .eq("user_id", user.id)
            .order("started_at", { ascending: false })
            .limit(5),

          supabase
            .from("user_achievements")
            .select("*, achievements(*)")
            .eq("user_id", user.id)
            .order("unlocked_at", { ascending: false })
            .limit(10),

          supabase
            .from("achievements")
            .select("id", { count: "exact", head: true }),
        ]);

      const profile = profileRes.data;

      const todayStudySeconds =
        sessionsRes.data?.reduce((sum, s) => sum + (s.actual_duration ?? 0), 0) ?? 0;

      const todayXp =
        xpRes.data?.reduce((sum, t) => sum + (t.amount ?? 0), 0) ?? 0;

      const roomMember = roomRes.data as DashboardData["roomMember"];

      const subjectProgress: SubjectProgress[] =
        subjectsRes.data?.map((s) => {
          const lessons = s.lessons ?? [];
          const completed = lessons.filter(
            (l: { status: string }) => l.status === "completed",
          ).length;
          return {
            ...s,
            completed_lessons: completed,
            total_lessons: lessons.length || s.total_lessons,
          };
        }) ?? [];

      const rank =
        leaderboardRes.data?.findIndex((u) => u.id === user.id) ?? -1;

      setData({
        profile,
        todayStudySeconds,
        todayXp,
        roomMember,
        subjectProgress,
        recentSessions: (recentSessionsRes.data as StudySession[]) ?? [],
        leaderboardRank: rank >= 0 ? rank + 1 : 0,
        achievements: (achievementsRes.data as UserAchievement[]) ?? [],
        totalAchievements: totalAchievementsRes.count ?? 25,
      });
      setLoading(false);
    }

    fetchDashboard();
  }, []);

  const xp = data.profile ? xpProgress(data.profile.xp) : null;
  const dailyTarget = 3600;
  const studyProgress = Math.min(data.todayStudySeconds / dailyTarget, 1);
  const earnedCount = data.achievements.length;

  return (
    <div className="space-y-8">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {loading ? "Loading..." : `Welcome back${data.profile?.display_name ? `, ${data.profile.display_name}` : ""}`}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here&apos;s your study overview for today
        </p>
      </div>

      {/* Stat Cards - uniform grid */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="animate-fade-in" style={{ animationDelay: "0.05s" }}>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
                <Zap size={16} className="text-primary" />
              </div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Level</span>
            </div>
            {xp ? (
              <div className="space-y-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold text-foreground tabular-nums">{xp.level}</span>
                  <span className="text-xs text-muted-foreground">
                    {xp.xpToNext} XP left
                  </span>
                </div>
                <ProgressBar value={xp.progress * 100} xpBar size="sm" />
                {data.profile && data.profile.current_streak > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {getStreakLabel(data.profile.current_streak)} · {getStreakMultiplier(data.profile.current_streak)}x
                  </p>
                )}
              </div>
            ) : (
              <div className="h-10 animate-shimmer rounded-lg bg-muted" />
            )}
          </CardContent>
        </Card>

        <Card className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/15">
                <Clock size={16} className="text-secondary" />
              </div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today</span>
            </div>
            <div className="space-y-2">
              <p className="text-3xl font-bold text-foreground tabular-nums">
                {loading ? (
                  <span className="inline-block h-8 w-16 animate-shimmer rounded bg-muted" />
                ) : (
                  formatDuration(data.todayStudySeconds)
                )}
              </p>
              <ProgressBar
                value={studyProgress * 100}
                size="sm"
                showPercentage={false}
              />
              <p className="text-xs text-muted-foreground">
                {Math.round(studyProgress * 100)}% of 1h target
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-fade-in" style={{ animationDelay: "0.15s" }}>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/15">
                <Flame size={16} className="text-orange-500" />
              </div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Streak</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-foreground tabular-nums">
                  {loading ? (
                    <span className="inline-block h-8 w-12 animate-shimmer rounded bg-muted" />
                  ) : (
                    data.profile?.current_streak ?? 0
                  )}
                </span>
                <span className="text-sm text-muted-foreground">
                  {data.profile?.current_streak === 1 ? "day" : "days"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Best: {data.profile?.longest_streak ?? 0} days
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15">
                <Trophy size={16} className="text-amber-500" />
              </div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">XP Today</span>
            </div>
            <div className="space-y-2">
              <p className="text-3xl font-bold text-foreground tabular-nums">
                {loading ? (
                  <span className="inline-block h-8 w-16 animate-shimmer rounded bg-muted" />
                ) : (
                  `+${data.todayXp}`
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                Total: {(data.profile?.xp ?? 0).toLocaleString()} XP
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Goal Progress */}
      {(data.profile?.daily_goal_seconds ?? 0) > 0 && (
        <div className="animate-fade-in" style={{ animationDelay: "0.25s" }}>
          <Card className="border-border/50">
            <CardContent className="py-4 px-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Target size={16} className="text-primary" />
                  <span className="text-sm font-medium text-foreground">
                    Daily Goal: {(data.profile!.daily_goal_seconds / 3600).toFixed(1)}h
                  </span>
                </div>
                <span className="text-sm font-medium text-muted-foreground tabular-nums">
                  {formatDuration(data.todayStudySeconds)} / {formatDuration(data.profile!.daily_goal_seconds)}
                </span>
              </div>
              <ProgressBar
                value={Math.min((data.todayStudySeconds / data.profile!.daily_goal_seconds) * 100, 100)}
                size="sm"
                showPercentage={false}
              />
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-muted-foreground">
                  {Math.round(Math.min((data.todayStudySeconds / data.profile!.daily_goal_seconds) * 100, 100))}% completed
                </p>
                {data.profile?.daily_goal_state && (() => {
                  const state = data.profile.daily_goal_state;
                  const expires = new Date(state.expires_at);
                  if (expires <= new Date()) return null;
                  if (state.type === "boost") {
                    return (
                      <span className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
                        <CheckCircle2 size={12} />
                        {state.multiplier}x boost active
                      </span>
                    );
                  }
                  return (
                    <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
                      <XCircle size={12} />
                      {state.multiplier}x penalty active
                    </span>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Active Room */}
      {data.roomMember && (
        <div className="animate-fade-in" style={{ animationDelay: "0.25s" }}>
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
                  <Users size={20} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    In room: {data.roomMember.rooms?.name ?? "Unknown"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Status: {data.roomMember.status}
                  </p>
                </div>
              </div>
              <Badge variant="default">Active</Badge>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Achievements */}
      <div className="animate-fade-in" style={{ animationDelay: "0.3s" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Award size={20} className="text-amber-500" />
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Achievements
            </h2>
          </div>
          <span className="text-sm text-muted-foreground">
            {earnedCount} / {data.totalAchievements} earned
          </span>
        </div>

        {earnedCount > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.achievements.map((ua) => {
              const ach = ua.achievements;
              if (!ach) return null;
              return (
                <Card key={ua.id} className="transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-start gap-3 py-4 px-5">
                    <span className="text-2xl shrink-0 mt-0.5">{ach.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{ach.name}</p>
                        <span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded-full border ${RARITY_COLORS[ach.rarity]}`}>
                          {ach.rarity}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{ach.description}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Unlocked {new Date(ua.unlocked_at).toLocaleDateString()}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8">
              <Medal size={32} className="mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No achievements yet</p>
              <p className="text-xs text-muted-foreground mt-1">Start studying to earn your first achievement!</p>
            </CardContent>
          </Card>
        )}

        {/* Category Progress */}
        {earnedCount > 0 && (
          <div className="mt-4 grid gap-2 grid-cols-2 sm:grid-cols-5">
            {Object.entries(CATEGORY_LABELS).map(([cat, label]) => {
              const Icon = CATEGORY_ICONS[cat];
              const catEarned = data.achievements.filter(
                (ua) => ua.achievements?.category === cat
              ).length;
              return (
                <div key={cat} className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
                  <Icon size={14} className="text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground truncate">{label}</span>
                  <span className="text-xs font-medium text-foreground ml-auto">{catEarned}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="animate-fade-in" style={{ animationDelay: "0.35s" }}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Link href="/rooms" className="group">
            <Card className="transition-colors hover:border-primary/30">
              <CardContent className="flex items-center gap-3 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary transition-colors group-hover:bg-primary/25">
                  <Play size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Start Studying</p>
                  <p className="text-xs text-muted-foreground">Begin a session</p>
                </div>
                <ArrowRight size={16} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </CardContent>
            </Card>
          </Link>

          <Link href="/rooms/create" className="group">
            <Card className="transition-colors hover:border-secondary/30">
              <CardContent className="flex items-center gap-3 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/15 text-secondary transition-colors group-hover:bg-secondary/25">
                  <Plus size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Create Room</p>
                  <p className="text-xs text-muted-foreground">Study with others</p>
                </div>
                <ArrowRight size={16} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </CardContent>
            </Card>
          </Link>

          <Link href="/leaderboard" className="group">
            <Card className="transition-colors hover:border-accent/30">
              <CardContent className="flex items-center gap-3 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent transition-colors group-hover:bg-accent/25">
                  <Trophy size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Leaderboard</p>
                  <p className="text-xs text-muted-foreground">
                    {data.leaderboardRank > 0 ? `Rank #${data.leaderboardRank}` : "View rankings"}
                  </p>
                </div>
                <ArrowRight size={16} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* Subject Progress */}
      <div className="animate-fade-in" style={{ animationDelay: "0.4s" }}>
        <div className="flex items-center gap-2 mb-4">
          <BookOpen size={20} className="text-muted-foreground" />
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Subject Progress
          </h2>
        </div>
        {data.subjectProgress.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.subjectProgress.map((subject) => {
              const pct =
                subject.total_lessons > 0
                  ? Math.round((subject.completed_lessons / subject.total_lessons) * 100)
                  : 0;
              return (
                <Card key={subject.id}>
                  <CardContent className="py-4">
                    <div className="mb-3 flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: subject.color }}
                      />
                      <span className="text-sm font-medium text-foreground">
                        {subject.name}
                      </span>
                    </div>
                    <ProgressBar
                      value={pct}
                      size="sm"
                      showPercentage
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {subject.completed_lessons}/{subject.total_lessons} lessons
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8">
              <BookOpen size={32} className="mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No subjects yet</p>
              <Link
                href="/subjects"
                className="mt-2 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Plus size={14} />
                Add your first subject
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent Sessions */}
      <div className="animate-fade-in" style={{ animationDelay: "0.45s" }}>
        <div className="flex items-center gap-2 mb-4">
          <Timer size={20} className="text-muted-foreground" />
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Recent Sessions
          </h2>
        </div>
        {data.recentSessions.length > 0 ? (
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {data.recentSessions.map((session) => (
                <div key={session.id} className="flex items-center gap-3 px-6 py-3">
                  <Timer size={16} className="shrink-0 text-muted-foreground" />
                  <div className="flex-1 overflow-hidden">
                    <p className="truncate text-sm text-foreground">
                      {session.study_method.replace("_", " ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(session.started_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-sm font-medium tabular-nums text-muted-foreground">
                    {formatDuration(session.actual_duration)}
                  </span>
                  {session.completed && (
                    <Badge variant="success" size="sm">
                      Done
                    </Badge>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8">
              <Clock size={32} className="mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No sessions yet</p>
              <Link
                href="/rooms"
                className="mt-2 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Play size={14} />
                Start your first session
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
