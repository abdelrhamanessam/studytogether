"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Zap,
  Trophy,
  Coffee,
  Bell,
  Timer,
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

export function GroupStudyPanel({ groupId, userId, member }: GroupStudyPanelProps) {
  const [method, setMethodState] = useState<StudyMethod>(
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
  } | null>(null);
  const [phaseNotice, setPhaseNotice] = useState<string | null>(null);
  const phaseNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabase = useRef(createClient());
  const pendingResumeRef = useRef<{
    seconds: number;
    mode: TimerMode;
    cycle: number;
  } | null>(null);
  const hasResumedRef = useRef(false);
  const completedFocusRef = useRef(0);
  const finishingRef = useRef(false);
  const methodRef = useRef(method);
  methodRef.current = method;

  useEffect(() => {
    const valid = (member.study_method as StudyMethod) in STUDY_METHODS
      ? (member.study_method as StudyMethod)
      : "pomodoro";
    if (valid !== methodRef.current) setMethodState(valid);
  }, [member.study_method]);

  const timerConfig = STUDY_METHODS[method];

  const timer = useTimer({
    studyMethod: method,
    studyDuration: timerConfig.studyDuration,
    breakDuration: timerConfig.breakDuration,
    cycles: timerConfig.cycles,
    targetDuration: targetMinutes * 60,
    onPhaseEnd: (event) => {
      if (event === "break") {
        completedFocusRef.current += focusDurationFor(methodRef.current);
        playBreakSound();
        setPhaseNotice("Focus complete! Time for a break.");
        void saveMember({ status: "break" });
      } else if (event === "focus") {
        playFocusSound();
        setPhaseNotice("Break over! Back to focus.");
        void saveMember({
          status: "focusing",
          session_started_at: new Date().toISOString(),
          last_active_date: todayKey(),
        });
      } else {
        completedFocusRef.current += focusDurationFor(methodRef.current);
        playDoneSound();
        setPhaseNotice("All cycles done! Great work!");
        if (!finishingRef.current) {
          finishingRef.current = true;
          void handleFinish().finally(() => {
            finishingRef.current = false;
          });
        }
      }
      if (phaseNoticeTimerRef.current) clearTimeout(phaseNoticeTimerRef.current);
      phaseNoticeTimerRef.current = setTimeout(() => setPhaseNotice(null), 8000);
    },
  });

  useEffect(() => {
    timer.reset();
    hasResumedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method]);

  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const effectiveAccumulated = useCallback(
    (m: { accumulated_seconds?: number | null; last_active_date?: string | null }) =>
      m.last_active_date === todayKey() ? (m.accumulated_seconds ?? 0) : 0,
    [],
  );

  useEffect(() => {
    if (
      member.status === "focusing" &&
      member.session_started_at &&
      !hasResumedRef.current
    ) {
      hasResumedRef.current = true;
      const startedAt = new Date(member.session_started_at).getTime();
      const localMidnight = new Date();
      localMidnight.setHours(0, 0, 0, 0);
      const stale =
        startedAt < localMidnight.getTime() ||
        (member.last_active_date != null &&
          member.last_active_date !== todayKey());
      if (stale) {
        void saveMember({ status: "idle", session_started_at: null });
      } else {
        const elapsed = Math.floor(
          Math.max(0, (Date.now() - startedAt) / 1000),
        );
        if (isCountdownMethod(methodRef.current)) {
          pendingResumeRef.current = {
            seconds: Math.max(1, focusDurationFor(methodRef.current) - elapsed),
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
    if (member.status === "paused" && member.paused_remaining_seconds != null) {
      const restored = member.paused_remaining_seconds ?? 0;
      if (isCountdownMethod(methodRef.current)) {
        timer.restore(Math.max(1, restored), "focus", 1);
      } else {
        timer.restore(restored, "focus", 1);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.status]);

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

  const fetchMember = useCallback(async () => {
    if (!groupId || !userId) return null;
    const { data } = await supabase.current
      .from("group_members")
      .select("accumulated_seconds, last_active_date, session_started_at, status")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle();
    return data ?? null;
  }, [groupId, userId]);

  const baseAccumulated = async () => {
    const fresh = await fetchMember();
    return effectiveAccumulated(fresh ?? member);
  };

  const currentFocusElapsed = useCallback(() => {
    if (!isCountdownMethod(method)) return timer.seconds;
    if (timer.mode === "break" || timer.phaseComplete) return 0;
    return Math.max(0, focusDurationFor(method) - timer.seconds);
  }, [method, timer.mode, timer.phaseComplete, timer.seconds]);

  const sessionFocusElapsed = useCallback(
    () => completedFocusRef.current + currentFocusElapsed(),
    [currentFocusElapsed],
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
      last_active_date: todayKey(),
    });
    timer.start();
  }, [groupId, userId, method, targetMinutes, timerConfig.cycles, timer, saveMember]);

  const handlePause = useCallback(async () => {
    timer.pause();
    const countsDown = isCountdownMethod(method);
    const currentElapsed = countsDown
      ? timer.mode === "break" || timer.phaseComplete
        ? 0
        : Math.max(0, focusDurationFor(method) - timer.seconds)
      : timer.seconds;
    const sessionElapsed = completedFocusRef.current + currentElapsed;
    const base = await baseAccumulated();
    const newAccumulated = base + sessionElapsed;
    const pausedRemaining = countsDown
      ? timer.mode === "break"
        ? Math.max(1, timer.seconds)
        : Math.max(1, focusDurationFor(method) - currentElapsed)
      : newAccumulated;

    await saveMember({
      status: "paused",
      accumulated_seconds: newAccumulated,
      last_active_date: todayKey(),
      paused_remaining_seconds: pausedRemaining,
    });
  }, [timer, method, effectiveAccumulated, saveMember]);

  const handleResume = useCallback(async () => {
    timer.resume();
    await saveMember({
      status: "focusing",
      session_started_at: new Date().toISOString(),
      paused_remaining_seconds: null,
      last_active_date: todayKey(),
    });
  }, [timer, saveMember]);

  const handleFinish = useCallback(async () => {
    timer.pause();
    const isCountUp = method === "stopwatch" || method === "target";
    const countsDown = isCountdownMethod(method);
    const sessionElapsed = isCountUp
      ? timer.seconds
      : completedFocusRef.current +
        (timer.mode === "break" || timer.phaseComplete
          ? 0
          : Math.max(0, focusDurationFor(method) - timer.seconds));
    const actualSeconds = Math.floor(Math.max(0, sessionElapsed));
    const base = await baseAccumulated();

    await saveMember({
      status: "finished",
      accumulated_seconds: base + actualSeconds,
      last_active_date: todayKey(),
      paused_remaining_seconds: null,
    });

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

      if (activeSession) {
        const actualMinutes = Math.max(1, Math.floor(actualSeconds / 60));

        await db
          .from("study_sessions")
          .update({
            actual_duration: actualSeconds,
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
          .select("active_boost")
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

        const boostedTotalXp = Math.floor(sessionXp.totalXp * boostMultiplier);
        const boostedCoins = Math.floor(boostedTotalXp / 2);

        await db.rpc("award_xp", {
          p_user_id: userId,
          p_amount: boostedTotalXp,
          p_reason: `Group study session (${actualMinutes}min)`,
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

        setXpEarned({
          base: sessionXp.baseXp,
          timeBonus: sessionXp.timeBonus,
          completionBonus: sessionXp.completionBonus,
          total: boostedTotalXp,
          minutes: actualMinutes,
          coins: boostedCoins,
          boostApplied,
          boostMultiplier,
        });
      } else {
        setXpEarned(null);
      }
    } catch (err) {
      console.error("Finish error:", err);
    }

    timer.reset();
    completedFocusRef.current = 0;
    hasResumedRef.current = false;
  }, [userId, groupId, method, targetMinutes, member, timer, saveMember, effectiveAccumulated, sessionFocusElapsed]);

  const handleReset = useCallback(async () => {
    timer.reset();
    completedFocusRef.current = 0;
    hasResumedRef.current = false;
    await saveMember({
      status: "idle",
      session_started_at: null,
      paused_remaining_seconds: null,
    });
  }, [timer, saveMember]);

  const handleMethodChange = useCallback(
    async (newMethod: StudyMethod) => {
      if (newMethod === method) return;
      if (timer.isRunning) {
        timer.pause();
        const isCountUp = method === "stopwatch" || method === "target";
        const sessionElapsed = isCountUp
          ? timer.seconds
          : completedFocusRef.current +
            (timer.mode === "break" || timer.phaseComplete
              ? 0
              : Math.max(0, focusDurationFor(method) - timer.seconds));
        const base = await baseAccumulated();
        await saveMember({
          accumulated_seconds: base + sessionElapsed,
          last_active_date: todayKey(),
        });
      }

      await supabase.current
        .from("study_sessions")
        .update({ status: "abandoned", ended_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("group_id", groupId)
        .eq("status", "active");

      completedFocusRef.current = 0;
      hasResumedRef.current = false;
      setMethodState(newMethod);
      await saveMember({
        study_method: newMethod,
        status: "idle",
        session_started_at: null,
        paused_remaining_seconds: null,
      });
    },
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
  const isCountUp = method === "stopwatch" || method === "target";
  const focusDur = focusDurationFor(method);
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
            Switch methods anytime — your study time is always saved. Breaks never count.
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
            const liveXp = estimateLiveXp(
              isCountUp ? timer.seconds : Math.max(0, focusDur - timer.seconds),
              !isCountUp
                ? focusDur
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
                    <span className="ml-1 text-xs text-secondary">
                      ({xpEarned.boostMultiplier}x boost)
                    </span>
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
    </div>
  );
}