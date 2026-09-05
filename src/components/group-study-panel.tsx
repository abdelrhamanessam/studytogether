"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Zap,
  Trophy,
  Coffee,
  Bell,
  Repeat,
  Timer,
  ChevronDown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, formatTimer } from "@/lib/utils";
import { playBreakSound, playFocusSound, playDoneSound, unlockAudio } from "@/lib/sounds";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useTimer, type TimerMode } from "@/hooks/use-timer";
import type { GroupMember, StudyMethod } from "@/types";
import { STUDY_METHODS } from "@/types";
import { calculateSessionXp, estimateLiveXp } from "@/lib/xp";

interface GroupStudyPanelProps {
  groupId: string;
  userId: string;
  member: GroupMember;
}

const COUNTDOWN_METHODS: StudyMethod[] = [
  "pomodoro",
  "long_pomodoro",
  "deep_focus",
  "custom",
];

function isCountdownMethod(method: StudyMethod): boolean {
  return COUNTDOWN_METHODS.includes(method);
}

function focusDurationFor(method: StudyMethod): number {
  const cfg = STUDY_METHODS[method];
  if (method === "custom") return 25 * 60;
  return cfg.studyDuration ?? 25 * 60;
}

export { isCountdownMethod, focusDurationFor };

export function GroupStudyPanel({ groupId, userId, member }: GroupStudyPanelProps) {
  const [method, setMethod] = useState<StudyMethod>(
    (member.study_method as StudyMethod) in STUDY_METHODS
      ? (member.study_method as StudyMethod)
      : "pomodoro",
  );
  const [targetMinutes, setTargetMinutes] = useState<number>(() =>
    member.target_duration ? Math.floor(member.target_duration / 60) : 30,
  );
  const [xpEarned, setXpEarned] = useState<{
    base: number;
    timeBonus: number;
    completionBonus: number;
    total: number;
    minutes: number;
    coins: number;
    boostApplied?: boolean;
    boostMultiplier?: number;
    goalAction?: string;
    goalMultiplier?: number;
    goalDuration?: number;
  } | null>(null);
  const [newAchievement, setNewAchievement] = useState<string | null>(null);
  const [autoCycle, setAutoCycle] = useState(false);
  const [phaseNotice, setPhaseNotice] = useState<string | null>(null);
  const phaseNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabase = useRef(createClient());
  const pendingResumeRef = useRef<{
    seconds: number;
    mode: TimerMode;
    cycle: number;
  } | null>(null);
  const hasResumedRef = useRef(false);

  useEffect(() => {
    if (localStorage.getItem("st_auto_cycle") === "1") setAutoCycle(true);
  }, []);

  const toggleAutoCycle = useCallback(() => {
    setAutoCycle((prev) => {
      const next = !prev;
      localStorage.setItem("st_auto_cycle", next ? "1" : "0");
      return next;
    });
  }, []);

  const timerConfig = STUDY_METHODS[method];

  const timer = useTimer({
    studyMethod: method,
    studyDuration: timerConfig.studyDuration,
    breakDuration: timerConfig.breakDuration,
    cycles: timerConfig.cycles,
    targetDuration: targetMinutes * 60,
    autoCycle,
    onPhaseEnd: (event) => {
      if (event === "break") {
        playBreakSound();
        setPhaseNotice("Focus complete! Time for a break.");
      } else if (event === "focus") {
        playFocusSound();
        setPhaseNotice("Break over! Back to focus.");
      } else {
        playDoneSound();
        setPhaseNotice("All cycles done! Great work!");
      }
      if (phaseNoticeTimerRef.current) clearTimeout(phaseNoticeTimerRef.current);
      phaseNoticeTimerRef.current = setTimeout(() => setPhaseNotice(null), 8000);
    },
  });

  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const effectiveAccumulated = useCallback(
    (m: { accumulated_seconds?: number | null; last_active_date?: string | null }) =>
      m.last_active_date === todayKey() ? (m.accumulated_seconds ?? 0) : 0,
    [],
  );

  // Resume an interrupted session on reload
  useEffect(() => {
    if (
      member.status === "focusing" &&
      member.session_started_at &&
      !hasResumedRef.current
    ) {
      hasResumedRef.current = true;
      if (member.last_active_date !== todayKey()) {
        void saveMember({
          status: "idle",
          session_started_at: null,
        });
      } else {
        const elapsed = Math.floor(
          (Date.now() - new Date(member.session_started_at).getTime()) / 1000,
        );
        if (isCountdownMethod(method)) {
          const focusDur = focusDurationFor(method);
          pendingResumeRef.current = {
            seconds: Math.max(1, focusDur - elapsed),
            mode: "focus",
            cycle: 1,
          };
        } else {
          pendingResumeRef.current = {
            seconds: effectiveAccumulated(member) + elapsed,
            mode: "focus",
            cycle: 1,
          };
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.status, member.session_started_at]);

  useEffect(() => {
    if (pendingResumeRef.current && timer.mode === "idle" && !timer.isRunning) {
      const r = pendingResumeRef.current;
      pendingResumeRef.current = null;
      timer.resumeFrom(r.seconds, r.mode, r.cycle);
    }
  }, [timer]);

  const saveMember = useCallback(
    async (patch: object) => {
      if (!groupId || !userId) return;
      await supabase.current
        .from("group_members")
        .update(patch)
        .eq("group_id", groupId)
        .eq("user_id", userId);
    },
    [groupId, userId],
  );

  const handleStart = useCallback(async () => {
    unlockAudio();
    const plannedDuration =
      method === "target"
        ? targetMinutes * 60
        : focusDurationFor(method) * (timerConfig.cycles ?? 1);

    const { error: sessionError } = await supabase.current
      .from("study_sessions")
      .insert({
        user_id: userId,
        group_id: groupId,
        study_method: method,
        planned_duration: plannedDuration,
        started_at: new Date().toISOString(),
        status: "active",
        completed: false,
      });
    if (sessionError) {
      console.error("Session create error:", sessionError);
      return;
    }

    await saveMember({
      status: "focusing",
      session_started_at: new Date().toISOString(),
      study_method: method,
    });
    timer.start();
  }, [groupId, userId, method, targetMinutes, timerConfig.cycles, timer, saveMember]);

  const handlePause = useCallback(async () => {
    timer.pause();
    const isCountUp = method === "stopwatch" || method === "target";
    const sessionElapsed = isCountUp
      ? timer.seconds
      : Math.max(
          0,
          focusDurationFor(method) - timer.seconds,
        );
    const newAccumulated =
      effectiveAccumulated(member) + sessionElapsed;

    await saveMember({
      status: "paused",
      accumulated_seconds: newAccumulated,
      last_active_date: todayKey(),
    });
  }, [timer, method, member, effectiveAccumulated, saveMember]);

  const handleResume = useCallback(async () => {
    timer.resume();
    await saveMember({
      status: "focusing",
      session_started_at: new Date().toISOString(),
    });
  }, [timer, saveMember]);

  const handleFinish = useCallback(async () => {
    try {
      const db = supabase.current;
      const { data: activeSession } = await db
        .from("study_sessions")
        .select("id, started_at")
        .eq("user_id", userId)
        .eq("group_id", groupId)
        .eq("status", "active")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let actualMinutes = Math.max(1, Math.floor(timer.seconds / 60));

      if (activeSession) {
        const isCountUp = method === "stopwatch" || method === "target";
        const actualDuration = isCountUp
          ? timer.seconds
          : Math.floor(
              (Date.now() - new Date(activeSession.started_at).getTime()) / 1000,
            );
        actualMinutes = Math.max(1, Math.floor(actualDuration / 60));

        await db
          .from("study_sessions")
          .update({
            actual_duration: actualDuration,
            ended_at: new Date().toISOString(),
            status: "completed",
            completed: true,
          })
          .eq("id", activeSession.id);

        const plannedMinutes =
          method === "target"
            ? targetMinutes
            : Math.round(focusDurationFor(method) / 60);

        const sessionXp = calculateSessionXp(actualMinutes, plannedMinutes);

        const { data: profileData } = await db
          .from("profiles")
          .select("active_boost, daily_goal_seconds, daily_goal_state")
          .eq("id", userId)
          .single();

        let boostMultiplier = 1;
        let boostApplied = false;
        if (profileData?.active_boost) {
          const expiresAt = new Date(profileData.active_boost.expires_at);
          if (expiresAt > new Date()) {
            boostMultiplier = profileData.active_boost.multiplier;
            boostApplied = true;
          }
        }

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const { data: todaySessions } = await db
          .from("study_sessions")
          .select("actual_duration")
          .eq("user_id", userId)
          .gte("started_at", todayStart.toISOString())
          .eq("status", "completed");
        const todayTotal =
          todaySessions?.reduce((s, ss) => s + (ss.actual_duration ?? 0), 0) ?? 0;

        let goalMultiplier = 1;
        let goalAction = "none";
        let goalDuration = 0;
        const { data: goalResult } = await db.rpc("apply_daily_goal_result", {
          p_user_id: userId,
          p_today_seconds: todayTotal,
        });
        if (goalResult && goalResult.length > 0) {
          const r = goalResult[0];
          goalAction = r.action;
          goalMultiplier = Number(r.multiplier);
          goalDuration = r.duration_minutes;
        }

        const finalMultiplier = boostMultiplier * goalMultiplier;
        const boostedTotalXp = Math.floor(sessionXp.totalXp * finalMultiplier);
        const boostedCoins = Math.floor(boostedTotalXp / 2);

        const reasons: string[] = [];
        if (boostApplied) reasons.push(`${boostMultiplier}x shop boost`);
        if (goalAction === "boost") reasons.push(`${goalMultiplier}x goal boost`);
        if (goalAction === "penalty") reasons.push(`${goalMultiplier}x goal penalty`);

        await db.rpc("award_xp", {
          p_user_id: userId,
          p_amount: boostedTotalXp,
          p_reason: `Group study session (${actualMinutes}min)` + (reasons.length ? ` [${reasons.join(", ")}]` : ""),
          p_session_id: activeSession.id,
        });

        if (boostedCoins > 0) {
          await db.rpc("grant_coins", {
            p_user_id: userId,
            p_amount: boostedCoins,
            p_reason: "Study session coins",
          });
        }

        await db.rpc("update_streak", { p_user_id: userId });
        await db.rpc("recalc_total_study_seconds", { p_user_id: userId });

        const { data: newAchievements } = await db.rpc(
          "check_and_award_achievements",
          { p_user_id: userId },
        );
        if (newAchievements && newAchievements.length > 0) {
          setNewAchievement(newAchievements[0].achievement_name);
          setTimeout(() => setNewAchievement(null), 5000);
        }

        setXpEarned({
          base: sessionXp.baseXp,
          timeBonus: sessionXp.timeBonus,
          completionBonus: sessionXp.completionBonus,
          total: boostedTotalXp,
          minutes: actualMinutes,
          coins: boostedCoins,
          boostApplied,
          boostMultiplier,
          goalAction,
          goalMultiplier: goalAction !== "none" ? goalMultiplier : undefined,
          goalDuration: goalAction !== "none" ? goalDuration : undefined,
        });
      }

      await saveMember({
        status: "finished",
        accumulated_seconds:
          effectiveAccumulated(member) + timer.seconds,
        last_active_date: todayKey(),
      });

      timer.reset();
      hasResumedRef.current = false;
    } catch (err) {
      console.error("Finish error:", err);
    }
  }, [userId, groupId, method, targetMinutes, member, timer, saveMember, effectiveAccumulated]);

  const handleReset = useCallback(async () => {
    timer.reset();
    hasResumedRef.current = false;
    await saveMember({ status: "idle", session_started_at: null });
  }, [timer, saveMember]);

  const handleMethodChange = useCallback(
    async (newMethod: StudyMethod) => {
      if (newMethod === method) return;
      if (timer.isRunning) {
        timer.pause();
        const isCountUp = method === "stopwatch" || method === "target";
        const sessionElapsed = isCountUp
          ? timer.seconds
          : Math.max(0, focusDurationFor(method) - timer.seconds);
        await saveMember({
          accumulated_seconds:
            effectiveAccumulated(member) + sessionElapsed,
          last_active_date: todayKey(),
        });
      }
      // abandon any active session when switching methods
      await supabase.current
        .from("study_sessions")
        .update({ status: "abandoned", ended_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("group_id", groupId)
        .eq("status", "active");

      timer.reset();

      setMethod(newMethod);
      hasResumedRef.current = false;
      await saveMember({
        study_method: newMethod,
        status: "idle",
        session_started_at: null,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [method, timer, saveMember, effectiveAccumulated, member, userId, groupId],
  );

  const switchTargetMinutes = useCallback(
    (mins: number) => {
      const clamped = Math.min(720, Math.max(1, Math.floor(mins)));
      setTargetMinutes(clamped);
      void saveMember({ target_duration: clamped * 60 });
    },
    [saveMember],
  );

  const timerMode: TimerMode = timer.mode;
  const timerStatusColor =
    timerMode === "focus" && timer.isRunning
      ? "text-success"
      : timerMode === "break"
        ? "text-warning"
        : "text-muted-foreground";
  const timerStatusBg =
    timerMode === "focus" && timer.isRunning
      ? "border-success/30 bg-success/5"
      : timerMode === "break"
        ? "border-warning/30 bg-warning/5"
        : "border-border bg-card";

  const showCycles = isCountdownMethod(method);

  return (
    <div className="space-y-4">
      {/* Method picker */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <Timer className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Your study method</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {(Object.keys(STUDY_METHODS) as StudyMethod[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => void handleMethodChange(m)}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all duration-200 cursor-pointer",
                  m === method
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border bg-muted/30 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                )}
              >
                {STUDY_METHODS[m].label}
              </button>
            ))}
          </div>
          {method === "target" && (
            <div className="mt-3 flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">
                Target time (minutes)
              </label>
              <Input
                type="number"
                min={1}
                max={720}
                value={targetMinutes}
                onChange={(e) => switchTargetMinutes(Number(e.target.value))}
                className="w-24 h-9"
              />
            </div>
          )}
          <p className="mt-2.5 text-[11px] text-muted-foreground">
            Switch methods anytime — your study time is always saved.
          </p>
        </CardContent>
      </Card>

      <Card
        className={cn(
          "relative overflow-hidden border-2 transition-all duration-500",
          timerStatusBg,
          timer.isRunning && timerMode === "focus" && "animate-pulse-glow",
        )}
      >
        <CardContent className="flex flex-col items-center gap-3 sm:gap-4 p-4 sm:p-8">
          <div className="flex items-center gap-2 text-sm">
            {timerMode === "focus" && timer.isRunning && (
              <Zap className="h-4 w-4 text-success animate-pulse" />
            )}
            {timerMode === "break" && <Coffee className="h-4 w-4 text-warning" />}
            <span className={cn("font-medium uppercase tracking-widest", timerStatusColor)}>
              {timerMode === "idle" && "Ready"}
              {timerMode === "focus" && timer.isRunning && "Focusing"}
              {timerMode === "focus" && !timer.isRunning && (timer.phaseComplete ? "Time's Up!" : "Paused")}
              {timerMode === "break" && (timer.phaseComplete ? "Break Over!" : "Break")}
            </span>
          </div>

          <div
            className={cn(
              "font-mono text-6xl sm:text-7xl font-bold tabular-nums tracking-tight",
              timerStatusColor,
            )}
          >
            {formatTimer(timer.seconds)}
          </div>

          {timer.isRunning && timerMode === "focus" && (() => {
            const isCountUp = method === "stopwatch" || method === "target";
            const elapsedSeconds = isCountUp
              ? timer.seconds
              : Math.max(0, focusDurationFor(method) - timer.seconds);
            const liveXp = estimateLiveXp(
              Math.max(0, elapsedSeconds),
              !isCountUp
                ? focusDurationFor(method)
                : method === "target"
                  ? targetMinutes * 60
                  : undefined,
            );
            return (
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1 text-success font-medium">
                  <Zap className="h-3 w-3" />
                  +{liveXp} XP earned
                </span>
              </div>
            );
          })()}

          {showCycles && (
            <div className="text-sm text-muted-foreground">
              Cycle {timer.currentCycle} / {timer.totalCycles}
            </div>
          )}

          {method === "target" && targetMinutes > 0 && (
            <div className="w-full max-w-xs">
              <ProgressBar
                value={timer.seconds}
                max={targetMinutes * 60}
                showPercentage
                size="sm"
              />
            </div>
          )}

          {phaseNotice && !timer.phaseComplete && (
            <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 animate-fade-in">
              <Bell className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium text-foreground">{phaseNotice}</span>
            </div>
          )}

          {timer.phaseComplete && (
            <div className="w-full max-w-md rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-center animate-fade-in">
              <p className="flex items-center justify-center gap-2 text-sm font-semibold text-warning">
                <Bell className="h-4 w-4 animate-pulse" />
                {timer.mode === "focus"
                  ? `Cycle ${timer.currentCycle} complete — take your break!`
                  : "Break finished — ready for the next cycle?"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Press continue when you&apos;re ready.
              </p>
            </div>
          )}

          {showCycles && (
            <div className="w-full max-w-xs">
              <ProgressBar
                value={timer.progress}
                size="sm"
                xpBar={timerMode === "focus"}
              />
            </div>
          )}

          {showCycles && timer.mode !== "idle" && (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 sm:px-4 py-2 w-full max-w-xs">
              <Repeat className={cn("h-4 w-4 shrink-0", autoCycle ? "text-primary" : "text-muted-foreground")} />
              <div className="text-left flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">Auto-continue cycles</p>
                <p className="text-[11px] text-muted-foreground">
                  {autoCycle ? "Cycles run back-to-back" : "You confirm each transition"}
                </p>
              </div>
              <button
                role="switch"
                aria-checked={autoCycle}
                onClick={toggleAutoCycle}
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer",
                  autoCycle ? "bg-primary" : "bg-muted-foreground/30",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                    autoCycle ? "translate-x-[22px]" : "translate-x-0.5",
                  )}
                />
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {timer.mode === "idle" && (
              <Button size="lg" onClick={() => void handleStart()} className="gap-2 px-8">
                <Play className="h-5 w-5" />
                Start Studying
              </Button>
            )}

            {timer.isRunning && (
              <Button variant="secondary" size="lg" onClick={handlePause} className="gap-2">
                <Pause className="h-5 w-5" />
                Pause
              </Button>
            )}

            {!timer.isRunning && timer.mode !== "idle" && (
              <>
                {timer.phaseComplete ? (
                  <Button
                    size="lg"
                    onClick={timer.continueNext}
                    className="gap-2 px-8 animate-pulse-glow"
                  >
                    <Play className="h-5 w-5" />
                    Continue to {timer.mode === "focus" ? "Break" : "Next Cycle"}
                  </Button>
                ) : (
                  <Button size="lg" onClick={handleResume} className="gap-2">
                    <Play className="h-5 w-5" />
                    Resume
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => void handleFinish()}
                  className="gap-2"
                >
                  <Trophy className="h-5 w-5" />
                  Finish
                </Button>
              </>
            )}

            {(timer.mode !== "idle" || timer.seconds > 0) && (
              <Button variant="ghost" size="lg" onClick={handleReset} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
            )}

            {showCycles && timer.mode !== "idle" && (
              <Button variant="ghost" size="lg" onClick={timer.skip} className="gap-2">
                <SkipForward className="h-4 w-4" />
                Skip
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {xpEarned && (
        <Card className="border-success/30 bg-success/5 animate-fade-in">
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Zap className="h-5 w-5 text-success shrink-0" />
                <span className="text-sm font-semibold text-success">
                  +{xpEarned.total} XP +{xpEarned.coins} coins
                  {xpEarned.boostApplied && (
                    <span className="ml-1 text-xs text-secondary">({xpEarned.boostMultiplier}x boost)</span>
                  )}
                  {xpEarned.goalAction === "boost" && (
                    <span className="ml-1 text-xs text-emerald-500">({xpEarned.goalMultiplier}x goal!)</span>
                  )}
                  {xpEarned.goalAction === "penalty" && (
                    <span className="ml-1 text-xs text-red-500">({xpEarned.goalMultiplier}x penalty)</span>
                  )}
                </span>
              </div>
              <button
                onClick={() => setXpEarned(null)}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
              >
                Dismiss
              </button>
            </div>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-2 text-xs text-muted-foreground">
              <div>
                <span className="text-foreground font-medium">{xpEarned.base}</span> Base ({xpEarned.minutes}min × 3)
              </div>
              <div>
                <span className="text-foreground font-medium">+{xpEarned.timeBonus}</span> Time bonus
              </div>
              <div>
                <span className="text-foreground font-medium">+{xpEarned.completionBonus}</span> Completion
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {newAchievement && (
        <Card className="border-amber-500/30 bg-amber-500/5 animate-fade-in">
          <CardContent className="flex items-center justify-between py-3 px-5">
            <div className="flex items-center gap-3">
              <Trophy className="h-5 w-5 text-amber-500" />
              <span className="text-sm font-semibold text-amber-500">
                Achievement Unlocked: {newAchievement}!
              </span>
            </div>
            <button
              onClick={() => setNewAchievement(null)}
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Dismiss
            </button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}