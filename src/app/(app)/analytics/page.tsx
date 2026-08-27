"use client";

import { useEffect, useState } from "react";
import {
  Clock,
  Flame,
  Zap,
  Target,
  Loader2,
  TrendingUp,
  BarChart3,
  BookOpen,
  RefreshCw,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import {
  formatDuration,
  formatDurationShort,
  cn,
} from "@/lib/utils";
import { xpProgress } from "@/lib/xp";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { StudySession, Subject } from "@/types";

type Range = "7d" | "30d" | "90d";

const RANGE_DAYS: Record<Range, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const PIE_COLORS = [
  "#7c6cf7",
  "#00e0db",
  "#ff8cb3",
  "#00d9a7",
  "#ffe066",
  "#ff7675",
  "#74b9ff",
  "#a29bfe",
  "#55efc4",
  "#fab1a0",
];

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c.toISOString();
}

export default function AnalyticsPage() {
  const [supabase] = useState(() => createClient());
  const [range, setRange] = useState<Range>("7d");
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [totalStudySeconds, setTotalStudySeconds] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [totalXp, setTotalXp] = useState(0);
  const [userLevel, setUserLevel] = useState(1);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [revisionData, setRevisionData] = useState<{ subjectName: string; subjectColor: string; totalRevisions: number; lessons: { name: string; revisionCount: number; status: string }[] }[]>([]);
  const [totalRevisions, setTotalRevisions] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) { setLoading(false); return; }
      setUserId(user.id);

      const now = new Date();
      const daysAgo = RANGE_DAYS[range];
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - daysAgo);
      const startIso = startOfDay(startDate);

      const { data: profile } = await supabase
        .from("profiles")
        .select("total_study_seconds, current_streak, longest_streak, xp, level")
        .eq("id", user.id)
        .single();

      if (cancelled) return;

      if (profile) {
        setTotalStudySeconds(profile.total_study_seconds ?? 0);
        setCurrentStreak(profile.current_streak ?? 0);
        setLongestStreak(profile.longest_streak ?? 0);
        setTotalXp(profile.xp ?? 0);
        setUserLevel(profile.level ?? 1);
      }

      const { data: rangeSessions } = await supabase
        .from("study_sessions")
        .select("*")
        .eq("user_id", user.id)
        .gte("started_at", startIso)
        .order("started_at", { ascending: true });

      if (cancelled) return;
      setSessions(rangeSessions ?? []);

      const { data: allSubjects } = await supabase
        .from("subjects")
        .select("*")
        .eq("user_id", user.id);

      if (cancelled) return;
      setSubjects(allSubjects ?? []);

      // Fetch all lessons with revision counts
      const { data: allLessons } = await supabase
        .from("lessons")
        .select("subject_id, name, revision_count, status")
        .eq("user_id", user.id);

      if (cancelled) return;

      // Aggregate revision data by subject
      const revisionMap: Record<string, { subjectName: string; subjectColor: string; totalRevisions: number; lessons: { name: string; revisionCount: number; status: string }[] }> = {};
      let totalRev = 0;

      (allLessons ?? []).forEach((lesson) => {
        const sub = allSubjects?.find((s) => s.id === lesson.subject_id);
        const revCount = lesson.revision_count ?? 0;
        totalRev += revCount;

        if (!revisionMap[lesson.subject_id]) {
          revisionMap[lesson.subject_id] = {
            subjectName: sub?.name ?? "Unknown",
            subjectColor: sub?.color ?? "#7c6cf7",
            totalRevisions: 0,
            lessons: [],
          };
        }
        revisionMap[lesson.subject_id].totalRevisions += revCount;
        if (revCount > 0) {
          revisionMap[lesson.subject_id].lessons.push({
            name: lesson.name,
            revisionCount: revCount,
            status: lesson.status,
          });
        }
      });

      // Sort by revision count descending
      const revisionArr = Object.values(revisionMap)
        .sort((a, b) => b.totalRevisions - a.totalRevisions)
        .map((r) => ({
          ...r,
          lessons: r.lessons.sort((a, b) => b.revisionCount - a.revisionCount),
        }));

      setRevisionData(revisionArr);
      setTotalRevisions(totalRev);

      setLoading(false);
    }
    fetchData();
    return () => { cancelled = true; };
  }, [range]);

  const completedSessions = sessions.filter(
    (s) => s.status === "completed",
  );

  const totalSessionCount = completedSessions.length;
  const totalRangeSeconds = completedSessions.reduce(
    (sum, s) => sum + (s.actual_duration ?? 0),
    0,
  );
  const avgSessionSeconds =
    totalSessionCount > 0
      ? Math.round(totalRangeSeconds / totalSessionCount)
      : 0;

  const dailyData = (() => {
    const days = RANGE_DAYS[range];
    const map: Record<string, number> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      map[key] = 0;
    }
    completedSessions.forEach((s) => {
      const d = new Date(s.started_at);
      const key = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      if (key in map) {
        map[key] += (s.actual_duration ?? 0) / 60;
      }
    });
    return Object.entries(map).map(([day, minutes]) => ({
      day,
      minutes: Math.round(minutes),
    }));
  })();

  const subjectData = (() => {
    const map: Record<string, number> = {};
    completedSessions.forEach((s) => {
      if (s.subject_id) {
        map[s.subject_id] =
          (map[s.subject_id] ?? 0) + (s.actual_duration ?? 0);
      }
    });
    return Object.entries(map)
      .map(([id, seconds]) => {
        const sub = subjects.find((s) => s.id === id);
        return {
          name: sub?.name ?? "Unknown",
          value: Math.round(seconds / 60),
          color: sub?.color ?? "#7c6cf7",
        };
      })
      .sort((a, b) => b.value - a.value);
  })();

  const weeklyData = (() => {
    const weeks: { week: string; minutes: number }[] = [];
    const now = new Date();
    const days = RANGE_DAYS[range];
    const start = new Date(now);
    start.setDate(start.getDate() - days);

    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const weekStart = new Date(start);
    weekStart.setDate(
      weekStart.getDate() - weekStart.getDay(),
    );
    weekStart.setHours(0, 0, 0, 0);

    let cursor = new Date(weekStart);
    let idx = 0;
    while (cursor <= now) {
      const nextCursor = new Date(cursor.getTime() + msPerWeek);
      const weekLabel = `W${idx + 1}`;
      let total = 0;
      completedSessions.forEach((s) => {
        const t = new Date(s.started_at).getTime();
        if (t >= cursor.getTime() && t < nextCursor.getTime()) {
          total += (s.actual_duration ?? 0) / 60;
        }
      });
      weeks.push({ week: weekLabel, minutes: Math.round(total) });
      cursor = nextCursor;
      idx++;
    }
    return weeks;
  })();

  const xp = xpProgress(totalXp);

  const statCards = [
    {
      label: "Study Time",
      value: formatDurationShort(totalRangeSeconds),
      sub: `${formatDurationShort(totalStudySeconds)} all-time`,
      icon: Clock,
      color: "text-primary",
    },
    {
      label: "Sessions",
      value: totalSessionCount.toString(),
      sub: `avg ${formatDurationShort(avgSessionSeconds)}`,
      icon: Target,
      color: "text-secondary",
    },
    {
      label: "Current Streak",
      value: `${currentStreak}d`,
      sub: `${longestStreak}d longest`,
      icon: Flame,
      color: "text-warning",
    },
    {
      label: "Total XP",
      value: totalXp.toLocaleString(),
      sub: `Level ${userLevel}`,
      icon: Zap,
      color: "text-accent",
    },
  ];

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-in flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track your study habits and progress over time
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-muted p-1">
          {(["7d", "30d", "90d"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                range === r
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r === "7d" ? "7 Days" : r === "30d" ? "30 Days" : "90 Days"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card
              key={stat.label}
              className="animate-fade-in"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <CardContent className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <Icon size={18} className={stat.color} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="mt-0.5 text-xl font-bold tracking-tight">
                    {stat.value}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {stat.sub}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="animate-fade-in" style={{ animationDelay: "240ms" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 size={16} />
            Study Time by Day
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#2a2a38"
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
                  tick={{ fill: "#8b8ba0", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: "#8b8ba0", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}m`}
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
                    `${Number(value)} min`,
                    "Study Time",
                  ]}
                />
                <Bar
                  dataKey="minutes"
                  fill="#7c6cf7"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          className="animate-fade-in"
          style={{ animationDelay: "300ms" }}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen size={16} />
              Study Time by Subject
            </CardTitle>
          </CardHeader>
          <CardContent>
            {subjectData.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                No subject data for this period
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
                <div className="h-48 w-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={subjectData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {subjectData.map((entry, index) => (
                          <Cell
                            key={entry.name}
                            fill={
                              PIE_COLORS[index % PIE_COLORS.length]
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1a1a24",
                          border: "1px solid #2a2a38",
                          borderRadius: "12px",
                          color: "#e8e8ed",
                          fontSize: "12px",
                        }}
                        formatter={(value) => [
                          `${Number(value)} min`,
                          "Study Time",
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2">
                  {subjectData.slice(0, 6).map((s, i) => (
                    <div
                      key={s.name}
                      className="flex items-center gap-2 text-sm"
                    >
                      <div
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor:
                            PIE_COLORS[i % PIE_COLORS.length],
                        }}
                      />
                      <span className="flex-1 truncate text-muted-foreground">
                        {s.name}
                      </span>
                      <span className="tabular-nums font-medium">
                        {formatDurationShort(s.value * 60)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card
          className="animate-fade-in"
          style={{ animationDelay: "360ms" }}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp size={16} />
              Weekly Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklyData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#2a2a38"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="week"
                    tick={{ fill: "#8b8ba0", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#8b8ba0", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}m`}
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
                      `${Number(value)} min`,
                      "Study Time",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="minutes"
                    stroke="#7c6cf7"
                    strokeWidth={2.5}
                    dot={{ fill: "#7c6cf7", r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="animate-fade-in" style={{ animationDelay: "420ms" }}>
        <CardHeader>
          <CardTitle>All-Time Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-muted p-4">
              <p className="text-xs text-muted-foreground">
                Total Study Time
              </p>
              <p className="mt-1 text-xl font-bold">
                {formatDuration(totalStudySeconds)}
              </p>
            </div>
            <div className="rounded-xl bg-muted p-4">
              <p className="text-xs text-muted-foreground">
                Longest Streak
              </p>
              <p className="mt-1 text-xl font-bold">
                {longestStreak} days
              </p>
            </div>
            <div className="rounded-xl bg-muted p-4">
              <p className="text-xs text-muted-foreground">
                Total Sessions
              </p>
              <p className="mt-1 text-xl font-bold">
                {completedSessions.length.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-muted p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                XP Progress
              </span>
              <Badge variant="default" size="sm">
                Level {xp.level}
              </Badge>
            </div>
            <ProgressBar
              value={xp.progress}
              xpBar
              size="md"
              showPercentage
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {totalXp.toLocaleString()} / {xp.nextLevelXp.toLocaleString()} XP
              &mdash; {xp.xpToNext.toLocaleString()} to next level
            </p>
          </div>

          {subjects.length > 0 && (
            <div>
              <h4 className="mb-3 text-sm font-medium">Subject Progress</h4>
              <div className="space-y-3">
                {subjects.map((sub) => (
                  <SubjectProgressRow
                    key={sub.id}
                    subject={sub}
                    userId={userId}
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revision Tracking Dashboard */}
      <Card className="animate-fade-in" style={{ animationDelay: "480ms" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw size={16} />
            Revision Tracking
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Total Revisions Summary */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-muted p-4">
              <p className="text-xs text-muted-foreground">Total Revisions</p>
              <p className="mt-1 text-2xl font-bold">{totalRevisions}</p>
              <p className="text-[11px] text-muted-foreground">across all subjects</p>
            </div>
            <div className="rounded-xl bg-muted p-4">
              <p className="text-xs text-muted-foreground">Subjects Revised</p>
              <p className="mt-1 text-2xl font-bold">
                {revisionData.filter((r) => r.totalRevisions > 0).length}
              </p>
              <p className="text-[11px] text-muted-foreground">
                out of {revisionData.length} total
              </p>
            </div>
            <div className="rounded-xl bg-muted p-4">
              <p className="text-xs text-muted-foreground">Avg per Subject</p>
              <p className="mt-1 text-2xl font-bold">
                {revisionData.length > 0
                  ? Math.round(totalRevisions / revisionData.length)
                  : 0}
              </p>
              <p className="text-[11px] text-muted-foreground">revisions</p>
            </div>
          </div>

          {/* Per-Subject Revision Breakdown */}
          {revisionData.length > 0 && (
            <div>
              <h4 className="mb-3 text-sm font-medium">Revisions by Subject</h4>
              <div className="space-y-3">
                {revisionData.map((r) => (
                  <div key={r.subjectName} className="rounded-xl bg-muted p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: r.subjectColor }}
                        />
                        <span className="text-sm font-medium">{r.subjectName}</span>
                      </div>
                      <span className="text-lg font-bold">{r.totalRevisions}</span>
                    </div>
                    {r.lessons.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {r.lessons.map((lesson) => (
                          <div
                            key={lesson.name}
                            className="flex items-center justify-between rounded-lg bg-background px-3 py-2 text-sm"
                          >
                            <div className="flex items-center gap-2">
                              <RefreshCw size={12} className="text-muted-foreground" />
                              <span className="truncate text-muted-foreground">
                                {lesson.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">×{lesson.revisionCount}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {lesson.status === "revised" ? "revised" : "done"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {totalRevisions === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <RefreshCw size={32} className="mb-3 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No revisions yet. Mark lessons as revised to track them here.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SubjectProgressRow({
  subject,
  userId,
}: {
  subject: Subject;
  userId: string;
}) {
  const [completed, setCompleted] = useState(0);
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    async function load() {
      const { data: lessons } = await supabase
        .from("lessons")
        .select("status")
        .eq("subject_id", subject.id)
        .eq("user_id", userId);
      if (lessons) {
        setCompleted(
          lessons.filter((l) => l.status === "completed").length,
        );
      }
    }
    if (userId) load();
  }, [subject.id, userId]);

  const pct =
    subject.total_lessons > 0
      ? Math.round((completed / subject.total_lessons) * 100)
      : 0;

  return (
    <div className="flex items-center gap-3">
      <div
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: subject.color }}
      />
      <span className="w-32 truncate text-sm text-muted-foreground">
        {subject.name}
      </span>
      <div className="flex-1">
        <ProgressBar value={pct} size="sm" />
      </div>
      <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
        {completed}/{subject.total_lessons}
      </span>
    </div>
  );
}
