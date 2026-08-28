"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  LogOut,
  Users,
  Clock,
  BookOpen,
  Zap,
  Trophy,
  Loader2,
  Coffee,
  CheckCircle2,
  Circle,
  ListChecks,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square,
  Bell,
  Repeat,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, formatTimer } from "@/lib/utils";
import { playBreakSound, playFocusSound, playDoneSound, unlockAudio } from "@/lib/sounds";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Avatar } from "@/components/ui/avatar";
import { useTimer, type TimerMode } from "@/hooks/use-timer";
import { useRealtimeRoom } from "@/hooks/use-realtime-room";
import type { Room, Profile, StudyMethod, Lesson, LessonPart } from "@/types";
import { STUDY_METHODS } from "@/types";
import { calculateSessionXp, getStreakMultiplier, estimateLiveXp } from "@/lib/xp";

interface RoomData extends Room {
  profiles: { display_name: string } | null;
  subjects: { name: string; color: string } | null;
}

interface ActivityEvent {
  id: string;
  message: string;
  time: string;
  type: "join" | "start" | "pause" | "finish" | "leave";
}

const STATUS_BADGE: Record<string, { variant: BadgeVariant; label: string }> = {
  focusing: { variant: "success", label: "Focusing" },
  break: { variant: "warning", label: "On Break" },
  paused: { variant: "muted", label: "Paused" },
  idle: { variant: "muted", label: "Idle" },
  finished: { variant: "default", label: "Finished" },
};

const LESSON_STATUS: Record<string, { icon: typeof CheckCircle2; color: string }> = {
  completed: { icon: CheckCircle2, color: "text-success" },
  revised: { icon: RefreshCw, color: "text-primary" },
  in_progress: { icon: Circle, color: "text-primary" },
  not_started: { icon: Circle, color: "text-muted-foreground" },
};

export default function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const router = useRouter();
  const [room, setRoom] = useState<RoomData | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [code, setCode] = useState("");
  const supabaseRef = useRef(createClient());
  const hasResumedRef = useRef(false);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [partsMap, setPartsMap] = useState<Record<string, LessonPart[]>>({});
  const [expandedLessons, setExpandedLessons] = useState<Set<string>>(new Set());
  const [userSubjects, setUserSubjects] = useState<{ id: string; name: string; color: string }[]>([]);
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
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

  useEffect(() => {
    params.then((p) => setCode(p.code));
  }, [params]);

  const addActivity = useCallback(
    (message: string, type: ActivityEvent["type"]) => {
      setActivities((prev) => [
        {
          id: crypto.randomUUID(),
          message,
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          type,
        },
        ...prev.slice(0, 49),
      ]);
    },
    [],
  );

  const loadLessons = useCallback(async (subjectId: string): Promise<boolean> => {
    const { data } = await supabaseRef.current
      .from("lessons")
      .select("*")
      .eq("subject_id", subjectId)
      .order("position", { ascending: true });
    if (data) {
      setLessons(data as Lesson[]);
      if (data.length === 0) {
        setPartsMap({});
        setExpandedLessons(new Set());
        return false;
      }
      const { data: partsData } = await supabaseRef.current
        .from("lesson_parts")
        .select("*")
        .in("lesson_id", data.map((l) => l.id))
        .order("position", { ascending: true });
      if (partsData) {
        const grouped: Record<string, LessonPart[]> = {};
        for (const p of partsData) {
          if (!grouped[p.lesson_id]) grouped[p.lesson_id] = [];
          grouped[p.lesson_id].push(p as LessonPart);
        }
        setPartsMap(grouped);
        setExpandedLessons(
          new Set(
            Object.entries(grouped)
              .filter(([, parts]) => parts.some((p) => !p.is_done))
              .map(([lessonId]) => lessonId),
          ),
        );
      } else {
        setPartsMap({});
        setExpandedLessons(new Set());
      }
      return true;
    }
    return false;
  }, []);

  const toggleLesson = useCallback(async (lesson: Lesson) => {
    const newStatus =
      lesson.status === "completed" ? "not_started"
      : lesson.status === "revised" ? "not_started"
      : "completed";
    const { error } = await supabaseRef.current
      .from("lessons")
      .update({
        status: newStatus,
        completed_at: newStatus === "completed" ? new Date().toISOString() : null,
      })
      .eq("id", lesson.id);
    if (error) {
      console.error("Toggle lesson error:", error);
      return;
    }

    if (newStatus === "completed") {
      await supabaseRef.current.rpc("award_lesson_xp", {
        p_user_id: currentUserId,
        p_lesson_id: lesson.id,
        p_is_revision: false,
      });
    }

    setLessons((prev) =>
      prev.map((l) =>
        l.id === lesson.id
          ? { ...l, status: newStatus as Lesson["status"], completed_at: newStatus === "completed" ? new Date().toISOString() : null }
          : l,
      ),
    );
  }, [currentUserId]);

  const togglePart = useCallback(async (part: LessonPart) => {
    const newDone = !part.is_done;
    await supabaseRef.current
      .from("lesson_parts")
      .update({ is_done: newDone })
      .eq("id", part.id);
    setPartsMap((prev) => ({
      ...prev,
      [part.lesson_id]: (prev[part.lesson_id] ?? []).map((p) =>
        p.id === part.id ? { ...p, is_done: newDone } : p,
      ),
    }));
  }, []);

  const reviseLesson = useCallback(async (lesson: Lesson) => {
    const newCount = (lesson.revision_count ?? 0) + 1;
    const { error } = await supabaseRef.current
      .from("lessons")
      .update({ status: "revised", completed_at: new Date().toISOString(), revision_count: newCount })
      .eq("id", lesson.id);
    if (error) {
      console.error("Revise lesson error:", error);
      return;
    }

    if (currentUserId) {
      await supabaseRef.current.rpc("award_lesson_xp", {
        p_user_id: currentUserId,
        p_lesson_id: lesson.id,
        p_is_revision: true,
      });
    }

    setLessons((prev) =>
      prev.map((l) =>
        l.id === lesson.id ? { ...l, status: "revised" as const, revision_count: newCount } : l,
      ),
    );
  }, [currentUserId]);

  const loadRoom = useCallback(async () => {
    if (!code) return;
    try {
      const supabase = supabaseRef.current;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setCurrentUserId(user.id);

      const { data: roomData, error: roomError } = await supabase
        .from("rooms")
        .select("*, profiles:owner_id(display_name), subjects(name, color)")
        .eq("code", code)
        .single();

      if (roomError || !roomData) {
        console.error("Room load error:", roomError);
        setLoading(false);
        return;
      }

      const typed = roomData as unknown as RoomData;
      setRoom(typed);

      const { data: memberData, error: memberCheckError } = await supabase
        .from("room_members")
        .select("id, status, session_started_at, accumulated_seconds, last_active_date")
        .eq("room_id", typed.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (memberCheckError) {
        console.error("Member check error:", memberCheckError.message, memberCheckError.code);
      }

      if (memberData) {
        setIsMember(true);

        const { data: mySubjects } = await supabase
          .from("subjects")
          .select("id, name, color")
          .eq("user_id", user.id)
          .order("name", { ascending: true });
        if (mySubjects) setUserSubjects(mySubjects);

        if (typed.subject_id) {
          setActiveSubjectId(typed.subject_id);
          const found = await loadLessons(typed.subject_id);
          if (!found && mySubjects && mySubjects.length > 0) {
            const fallback = mySubjects[0];
            setActiveSubjectId(fallback.id);
            await loadLessons(fallback.id);
          }
        } else if (mySubjects && mySubjects.length > 0) {
          const fallback = mySubjects[0];
          setActiveSubjectId(fallback.id);
          await loadLessons(fallback.id);
        }

        if (
          memberData.status === "focusing" &&
          memberData.session_started_at &&
          !hasResumedRef.current
        ) {
          hasResumedRef.current = true;
          const elapsed = Math.floor(
            (Date.now() - new Date(memberData.session_started_at).getTime()) / 1000,
          );
          const studyMethodVal = (typed.study_method ?? "pomodoro") as StudyMethod;
          const methodConfig = STUDY_METHODS[studyMethodVal];
          const isCountdownMethod =
            studyMethodVal === "pomodoro" ||
            studyMethodVal === "long_pomodoro" ||
            studyMethodVal === "deep_focus" ||
            studyMethodVal === "custom";

          if (isCountdownMethod) {
            const focusDur = studyMethodVal === "custom"
              ? (typed.study_duration ?? methodConfig.studyDuration ?? 1500)
              : (methodConfig.studyDuration ?? 1500);
            const remaining = Math.max(1, focusDur - elapsed);
            pendingResumeRef.current = {
              seconds: remaining,
              mode: "focus",
              cycle: 1,
            };
          } else {
            const accumulated = effectiveAccumulated(memberData);
            pendingResumeRef.current = {
              seconds: accumulated + elapsed,
              mode: "focus",
              cycle: 1,
            };
          }

          await supabase
            .from("room_members")
            .update({ status: "focusing" })
            .eq("room_id", typed.id)
            .eq("user_id", user.id);
        }
      }
    } catch (err) {
      console.error("Failed to load room:", err);
    } finally {
      setLoading(false);
    }
  }, [code, router, loadLessons]);

  const pendingResumeRef = useRef<{
    seconds: number;
    mode: TimerMode;
    cycle: number;
  } | null>(null);

  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const effectiveAccumulated = (member: { accumulated_seconds?: number | null; last_active_date?: string | null }) =>
    member.last_active_date === todayKey() ? (member.accumulated_seconds ?? 0) : 0;

  useEffect(() => {
    loadRoom();
  }, [loadRoom]);

  const { members, refreshMembers } = useRealtimeRoom({
    roomId: room?.id ?? "",
  });

  const currentUserMember = members.find((m) => m.user_id === currentUserId);
  const studyMethod = (room?.study_method ?? "pomodoro") as StudyMethod;
  const timerConfig = STUDY_METHODS[studyMethod];

  const [autoCycle, setAutoCycle] = useState(false);
  const [phaseNotice, setPhaseNotice] = useState<string | null>(null);
  const phaseNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const timer = useTimer({
    studyMethod,
    studyDuration: room?.study_duration ?? timerConfig.studyDuration,
    breakDuration: room?.break_duration ?? timerConfig.breakDuration,
    cycles: room?.cycles ?? timerConfig.cycles,
    targetDuration: room?.target_duration,
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
        setPhaseNotice("All cycles done! Great work! 🎉");
      }
      if (phaseNoticeTimerRef.current) clearTimeout(phaseNoticeTimerRef.current);
      phaseNoticeTimerRef.current = setTimeout(() => setPhaseNotice(null), 8000);
    },
  });

  useEffect(() => {
    if (pendingResumeRef.current && timer.mode === "idle" && !timer.isRunning) {
      const { seconds, mode, cycle } = pendingResumeRef.current;
      pendingResumeRef.current = null;
      timer.resumeFrom(seconds, mode, cycle);
    }
  }, [timer]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible" && activeSubjectId) {
        loadLessons(activeSubjectId);
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [activeSubjectId, loadLessons]);

  const handleJoin = useCallback(async () => {
    if (!room || !currentUserId) return;
    setJoining(true);
    try {
      const { error } = await supabaseRef.current
        .from("room_members")
        .upsert(
          {
            room_id: room.id,
            user_id: currentUserId,
            status: "idle",
          },
          { onConflict: "room_id,user_id" },
        );
      if (error) {
        console.error("Join error:", error.message, error.code, error.details);
        return;
      }
      setIsMember(true);
      addActivity("joined the room", "join");
      await refreshMembers();

      const { data: mySubjects } = await supabaseRef.current
        .from("subjects")
        .select("id, name, color")
        .eq("user_id", currentUserId)
        .order("name", { ascending: true });
      if (mySubjects) setUserSubjects(mySubjects);

      if (room.subject_id) {
        setActiveSubjectId(room.subject_id);
        const found = await loadLessons(room.subject_id);
        if (!found && mySubjects && mySubjects.length > 0) {
          const fallback = mySubjects[0];
          setActiveSubjectId(fallback.id);
          await loadLessons(fallback.id);
        }
      } else if (mySubjects && mySubjects.length > 0) {
        const fallback = mySubjects[0];
        setActiveSubjectId(fallback.id);
        await loadLessons(fallback.id);
      }
    } finally {
      setJoining(false);
    }
  }, [room, currentUserId, addActivity, refreshMembers, loadLessons]);

  const handleStart = useCallback(async () => {
    if (!room || !currentUserId) return;
    unlockAudio();
    try {
      const { error: sessionError } = await supabaseRef.current
        .from("study_sessions")
        .insert({
          user_id: currentUserId,
          room_id: room.id,
          subject_id: activeSubjectId ?? room.subject_id,
          study_method: studyMethod,
          planned_duration:
            studyMethod === "target"
              ? room.target_duration
              : room.study_duration
                ? room.study_duration * (room.cycles ?? 1)
                : null,
          started_at: new Date().toISOString(),
          status: "active",
          completed: false,
        });

      if (sessionError) {
        console.error("Session create error:", sessionError);
        return;
      }

      const { error: memberError } = await supabaseRef.current
        .from("room_members")
        .update({
          status: "focusing",
          session_started_at: new Date().toISOString(),
        })
        .eq("room_id", room.id)
        .eq("user_id", currentUserId);

      if (memberError) {
        console.error("Member update error:", memberError);
        return;
      }

      timer.start();
      addActivity("started studying", "start");
    } catch (err) {
      console.error("Start error:", err);
    }
  }, [room, currentUserId, studyMethod, timer, addActivity]);

  const handlePause = useCallback(async () => {
    if (!room || !currentUserId) return;
    timer.pause();
    const { error } = await supabaseRef.current
      .from("room_members")
      .update({ status: "paused" })
      .eq("room_id", room.id)
      .eq("user_id", currentUserId);
    if (error) console.error("Pause error:", error);
    addActivity("paused", "pause");
  }, [room, currentUserId, timer, addActivity]);

  const handleResume = useCallback(async () => {
    if (!room || !currentUserId) return;
    timer.resume();
    const { error } = await supabaseRef.current
      .from("room_members")
      .update({
        status: "focusing",
        session_started_at: new Date().toISOString(),
      })
      .eq("room_id", room.id)
      .eq("user_id", currentUserId);
    if (error) console.error("Resume error:", error);
    addActivity("resumed studying", "start");
  }, [room, currentUserId, timer, addActivity]);

  const handleFinish = useCallback(async () => {
    if (!room || !currentUserId) return;
    try {
      const supabase = supabaseRef.current;
      const { data: activeSession } = await supabase
        .from("study_sessions")
        .select("id, started_at")
        .eq("user_id", currentUserId)
        .eq("room_id", room.id)
        .eq("status", "active")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeSession) {
        const isCountUp =
          studyMethod === "stopwatch" || studyMethod === "target";

        // For count-up methods (stopwatch/target) the actual studied time is
        // the timer itself (excludes any paused time). For countdown methods
        // fall back to the wall-clock duration of the session.
        const actualDuration = isCountUp
          ? timer.seconds
          : Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 1000);
        const actualMinutes = Math.floor(actualDuration / 60);

        await supabase
          .from("study_sessions")
          .update({
            actual_duration: actualDuration,
            ended_at: new Date().toISOString(),
            status: "completed",
            completed: true,
          })
          .eq("id", activeSession.id);

        const plannedMinutes = studyMethod === "target"
          ? (room.target_duration ? Math.floor(room.target_duration / 60) : undefined)
          : room.study_duration
            ? room.study_duration / 60
            : undefined;

        const sessionXp = calculateSessionXp(actualMinutes, plannedMinutes);

        // Check for active XP boost
        const { data: profileData } = await supabase
          .from("profiles")
          .select("active_boost, daily_goal_seconds, daily_goal_state")
          .eq("id", currentUserId)
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

        // Calculate today's total study time (this session is already marked completed above)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const { data: todaySessions } = await supabase
          .from("study_sessions")
          .select("actual_duration")
          .eq("user_id", currentUserId)
          .gte("started_at", todayStart.toISOString())
          .eq("status", "completed");
        const todayTotal = todaySessions?.reduce((s, ss) => s + (ss.actual_duration ?? 0), 0) ?? 0;

        // Apply daily goal result
        let goalMultiplier = 1;
        let goalAction = "none";
        let goalDuration = 0;
        const { data: goalResult } = await supabase.rpc("apply_daily_goal_result", {
          p_user_id: currentUserId,
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

        await supabase.rpc("award_xp", {
          p_user_id: currentUserId,
          p_amount: boostedTotalXp,
          p_reason: `Study session (${actualMinutes}min)` + (reasons.length ? ` [${reasons.join(", ")}]` : ""),
          p_session_id: activeSession.id,
        });

        // Convert XP to coins (1 XP = 0.5 coins)
        if (boostedCoins > 0) {
          await supabase.rpc("grant_coins", {
            p_user_id: currentUserId,
            p_amount: boostedCoins,
            p_reason: "Study session coins",
          });
        }

        await supabase.rpc("update_streak", {
          p_user_id: currentUserId,
        });

        await supabase.rpc("recalc_total_study_seconds", {
          p_user_id: currentUserId,
        });

        const { data: newAchievements } = await supabase.rpc("check_and_award_achievements", {
          p_user_id: currentUserId,
        });
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

      await supabase
        .from("room_members")
        .update({
          status: "finished",
          accumulated_seconds:
            effectiveAccumulated(currentUserMember ?? {}) + timer.seconds,
          last_active_date: todayKey(),
        })
        .eq("room_id", room.id)
        .eq("user_id", currentUserId);

      const finishedTime = timer.seconds;
      timer.reset();
      hasResumedRef.current = false;
      addActivity(`finished studying (${formatTimer(finishedTime)})`, "finish");
      await refreshMembers();
    } catch (err) {
      console.error("Finish error:", err);
    }
  }, [room, currentUserId, timer, currentUserMember, addActivity, refreshMembers, studyMethod]);

  const handleReset = useCallback(async () => {
    if (!room || !currentUserId) return;
    timer.reset();
    hasResumedRef.current = false;
    await supabaseRef.current
      .from("room_members")
      .update({ status: "idle" })
      .eq("room_id", room.id)
      .eq("user_id", currentUserId);
  }, [room, currentUserId, timer]);

  const handleLeave = useCallback(async () => {
    if (!room || !currentUserId) return;
    if (timer.isRunning) {
      await handleFinish();
    }
    await supabaseRef.current
      .from("room_members")
      .delete()
      .eq("room_id", room.id)
      .eq("user_id", currentUserId);
    addActivity("left the room", "leave");
    router.push("/rooms");
  }, [room, currentUserId, timer.isRunning, handleFinish, addActivity, router]);

  const completedLessons = lessons.filter((l) => l.status === "completed" || l.status === "revised").length;

  if (loading || !code) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <h2 className="text-xl font-bold">Room not found</h2>
        <p className="text-sm text-muted-foreground">
          This room may have been deleted or the code is invalid.
        </p>
        <Link href="/rooms">
          <Button>Browse Rooms</Button>
        </Link>
      </div>
    );
  }

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

  const showCycles =
    studyMethod === "pomodoro" ||
    studyMethod === "long_pomodoro" ||
    studyMethod === "deep_focus" ||
    studyMethod === "custom";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/rooms">
            <Button variant="ghost" size="sm" className="gap-1 shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">{room.name}</h1>
            <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 shrink-0" />
                {STUDY_METHODS[studyMethod].label}
              </span>
              {room.subjects?.name && (
                <span className="flex items-center gap-1">
                  <BookOpen className="h-3 w-3 shrink-0" />
                  <span className="truncate">{room.subjects.name}</span>
                </span>
              )}
              <Badge variant="muted" size="sm">
                {room.code}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <Badge variant="secondary" size="sm" className="gap-1 hidden sm:flex">
            <Users className="h-3 w-3" />
            {members.length}/{room.max_participants}
          </Badge>
          <Button
            variant="danger"
            size="sm"
            onClick={handleLeave}
            className="gap-1"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Leave</span>
          </Button>
        </div>
      </div>

      {!isMember ? (
        <Card className="flex flex-col items-center gap-4 py-12">
          <Users className="h-12 w-12 text-primary" />
          <div className="text-center">
            <h3 className="text-lg font-semibold">Join this room</h3>
            <p className="text-sm text-muted-foreground">
              Study together with {members.length} other{" "}
              {members.length === 1 ? "person" : "people"}
            </p>
          </div>
          <Button size="lg" onClick={handleJoin} loading={joining}>
            Join Room
          </Button>
        </Card>
      ) : (
        <>
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
                {timerMode === "break" && (
                  <Coffee className="h-4 w-4 text-warning" />
                )}
                <span
                  className={cn(
                    "font-medium uppercase tracking-widest",
                    timerStatusColor,
                  )}
                >
                  {timerMode === "idle" && "Ready"}
                  {timerMode === "focus" && timer.isRunning && "Focusing"}
                  {timerMode === "focus" && !timer.isRunning && (timer.phaseComplete ? "Time's Up!" : "Paused")}
                  {timerMode === "break" && (timer.phaseComplete ? "Break Over!" : "Break")}
                </span>
              </div>

              <div
                className={cn(
                  "font-mono text-6xl sm:text-7xl md:text-8xl font-bold tabular-nums tracking-tight",
                  timerStatusColor,
                )}
              >
                {formatTimer(timer.seconds)}
              </div>

              {timer.isRunning && timerMode === "focus" && (() => {
                const isCountUp =
                  studyMethod === "stopwatch" || studyMethod === "target";
                const elapsedSeconds = isCountUp
                  ? timer.seconds
                  : (() => {
                      const methodConfig = STUDY_METHODS[studyMethod];
                      const focusDur = studyMethod === "custom"
                        ? (room.study_duration ?? methodConfig.studyDuration ?? 1500)
                        : (methodConfig.studyDuration ?? 1500);
                      return focusDur - timer.seconds;
                    })();
                const liveXp = estimateLiveXp(
                  Math.max(0, elapsedSeconds),
                  !isCountUp ? (room.study_duration ?? undefined) : undefined,
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

              {studyMethod === "target" &&
                room.target_duration &&
                room.target_duration > 0 && (
                  <div className="w-full max-w-xs">
                    <ProgressBar
                      value={timer.seconds}
                      max={room.target_duration}
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
                  <Button
                    size="lg"
                    onClick={handleStart}
                    className="gap-2 px-8"
                  >
                    <Play className="h-5 w-5" />
                    Start Studying
                  </Button>
                )}

                {timer.isRunning && (
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={handlePause}
                    className="gap-2"
                  >
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
                      <Button
                        size="lg"
                        onClick={handleResume}
                        className="gap-2"
                      >
                        <Play className="h-5 w-5" />
                        Resume
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={handleFinish}
                      className="gap-2"
                    >
                      <Trophy className="h-5 w-5" />
                      Finish
                    </Button>
                  </>
                )}

                {(timer.mode !== "idle" || timer.seconds > 0) && (
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={handleReset}
                    className="gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset
                  </Button>
                )}

                {showCycles && timer.mode !== "idle" && (
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={timer.skip}
                    className="gap-2"
                  >
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
                      +{xpEarned.total} XP +{xpEarned.coins} 🪙
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

          <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-3 sm:space-y-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <Users className="h-4 w-4" />
                Participants ({members.length})
              </h2>
              <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-2">
                {members.map((member) => {
                  const profile = member.profiles as Profile | undefined;
                  const statusInfo =
                    STATUS_BADGE[member.status] ?? STATUS_BADGE.idle;

                  let memberTimer = "0:00";
                  if (
                    member.status === "focusing" &&
                    member.session_started_at
                  ) {
                    const elapsed = Math.floor(
                      (Date.now() -
                        new Date(member.session_started_at).getTime()) /
                        1000,
                    );
                    memberTimer = formatTimer(
                      effectiveAccumulated(member) + elapsed,
                    );
                  } else {
                    memberTimer = formatTimer(effectiveAccumulated(member));
                  }
                  const isToday = member.last_active_date === todayKey();

                  return (
                    <div
                      key={member.id}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border p-3 transition-all",
                        member.user_id === currentUserId
                          ? "border-primary/30 bg-primary/5"
                          : "border-border bg-card",
                        member.status === "focusing" &&
                          "border-success/20 bg-success/5",
                      )}
                    >
                      <Avatar
                        src={profile?.avatar_url}
                        alt={profile?.display_name ?? ""}
                        fallback={profile?.display_name ?? "?"}
                        size="md"
                        showLevelRing={
                          member.status === "focusing" &&
                          member.user_id !== currentUserId
                        }
                        level={profile?.level}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {profile?.display_name ?? "Unknown"}
                            {member.user_id === currentUserId && (
                              <span className="text-muted-foreground">
                                {" "}
                                (you)
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant={statusInfo.variant} size="sm">
                            {statusInfo.label}
                          </Badge>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {memberTimer}
                            <span className="ml-1 text-[11px] opacity-70">
                              {isToday ? "today" : "before today"}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {members.length === 0 && (
                  <div className="col-span-full py-8 text-center text-sm text-muted-foreground">
                    No participants yet. Be the first to join!
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <Clock className="h-4 w-4" />
                Activity
              </h2>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {activities.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No activity yet
                  </p>
                ) : (
                  activities.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-2 text-xs"
                    >
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {event.time}
                      </span>
                      <span className="text-foreground">{event.message}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Room Info
                </h3>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Method</span>
                    <span className="text-foreground">
                      {STUDY_METHODS[studyMethod].label}
                    </span>
                  </div>
                  {room.study_duration && (
                    <div className="flex justify-between">
                      <span>Focus</span>
                      <span className="text-foreground">
                        {formatTimer(room.study_duration)}
                      </span>
                    </div>
                  )}
                  {room.break_duration && (
                    <div className="flex justify-between">
                      <span>Break</span>
                      <span className="text-foreground">
                        {formatTimer(room.break_duration)}
                      </span>
                    </div>
                  )}
                  {room.cycles && (
                    <div className="flex justify-between">
                      <span>Cycles</span>
                      <span className="text-foreground">{room.cycles}</span>
                    </div>
                  )}
                  {room.target_duration && (
                    <div className="flex justify-between">
                      <span>Target</span>
                      <span className="text-foreground">
                        {formatTimer(room.target_duration)}
                      </span>
                    </div>
                  )}
                  {(() => {
                    const focusMin = studyMethod === "custom"
                      ? Math.floor((room.study_duration ?? 1500) / 60)
                      : Math.floor((timerConfig.studyDuration ?? 1500) / 60);
                    const plannedMin = studyMethod === "target" ? undefined : focusMin;
                    const est = calculateSessionXp(focusMin, plannedMin);
                    const cyc = room.cycles ?? timerConfig.cycles ?? 1;
                    return (
                      <div className="flex justify-between pt-1 border-t border-border">
                        <span className="text-primary font-medium">Est. XP</span>
                        <span className="text-primary font-semibold">
                          {est.totalXp} / cycle × {cyc} = {est.totalXp * cyc} total
                        </span>
                      </div>
                    );
                  })()}
                  {room.description && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-foreground">{room.description}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {lessons.length > 0 && (() => {
            const grouped = lessons.reduce<Record<string, typeof lessons>>((acc, l) => {
              const u = l.unit_name || "";
              if (!acc[u]) acc[u] = [];
              acc[u].push(l);
              return acc;
            }, {});
            const unitKeys = Object.keys(grouped);

            return (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      <ListChecks className="h-4 w-4" />
                      Tasks
                    </h2>
                    <div className="flex items-center gap-2">
                      {userSubjects.length > 1 && (
                        <div className="relative">
                          <select
                            value={activeSubjectId ?? ""}
                            onChange={(e) => {
                              const newId = e.target.value;
                              setActiveSubjectId(newId);
                              loadLessons(newId);
                            }}
                            className="appearance-none rounded-lg border border-border bg-muted px-3 py-1.5 pr-7 text-xs font-medium text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            {userSubjects.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                        </div>
                      )}
                      <Badge variant="secondary" size="sm">
                        {completedLessons}/{lessons.length}
                      </Badge>
                    </div>
                  </div>
                  <ProgressBar
                    value={completedLessons}
                    max={lessons.length}
                    size="sm"
                    xpBar
                  />
                  <div className="mt-3 space-y-3">
                    {unitKeys.map((unitName) => (
                      <div key={unitName || "__none"}>
                        {unitName && (
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-1">
                            {unitName}
                          </p>
                        )}
                        <div className="space-y-1">
                          {grouped[unitName].map((lesson) => {
                            const statusInfo = LESSON_STATUS[lesson.status] ?? LESSON_STATUS.not_started;
                            const StatusIcon = statusInfo.icon;
                            const lessonParts = partsMap[lesson.id] ?? [];
                            const hasParts = lessonParts.length > 0;
                            const doneParts = lessonParts.filter((p) => p.is_done).length;
                            const isExpanded = expandedLessons.has(lesson.id);
                            return (
                              <div key={lesson.id}>
                                <div className="flex items-center gap-1">
                                  {hasParts && (
                                    <button
                                      onClick={() => setExpandedLessons((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(lesson.id)) next.delete(lesson.id);
                                        else next.add(lesson.id);
                                        return next;
                                      })}
                                      className="shrink-0 p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                                    >
                                      {isExpanded
                                        ? <ChevronDown className="h-3.5 w-3.5" />
                                        : <ChevronRight className="h-3.5 w-3.5" />}
                                    </button>
                                  )}
                                  {!hasParts && <div className="w-5" />}
                                  <button
                                    onClick={() => toggleLesson(lesson)}
                                    className={cn(
                                      "flex flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors cursor-pointer",
                                      lesson.status === "completed"
                                        ? "bg-success/5 hover:bg-success/10"
                                        : lesson.status === "revised"
                                          ? "bg-primary/5 hover:bg-primary/10"
                                          : "hover:bg-muted/50",
                                    )}
                                  >
                                    <StatusIcon
                                      className={cn(
                                        "h-4 w-4 shrink-0",
                                        statusInfo.color,
                                      )}
                                    />
                                    <span
                                      className={cn(
                                        "flex-1 text-sm",
                                        (lesson.status === "completed" || lesson.status === "revised") &&
                                          "line-through text-muted-foreground",
                                      )}
                                    >
                                      {lesson.name}
                                    </span>
                                    {hasParts && (
                                      <Badge variant={doneParts === lessonParts.length ? "success" : "muted"} size="sm">
                                        {doneParts}/{lessonParts.length}
                                      </Badge>
                                    )}
                                    {lesson.status === "completed" && (
                                      <Badge variant="success" size="sm">
                                        {lesson.revision_count > 0 ? `Done ×${lesson.revision_count}r` : "Done"}
                                      </Badge>
                                    )}
                                    {lesson.status === "revised" && (
                                      <Badge variant="default" size="sm">
                                        Revised {lesson.revision_count > 0 ? `×${lesson.revision_count}` : ""}
                                      </Badge>
                                    )}
                                    {lesson.status === "in_progress" && (
                                      <Badge variant="warning" size="sm">In Progress</Badge>
                                    )}
                                  </button>
                                  <button
                                    onClick={() => reviseLesson(lesson)}
                                    className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary cursor-pointer opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                                    title="Mark as revised"
                                  >
                                    <RefreshCw className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                {hasParts && isExpanded && (
                                  <div className="ml-6 border-l-2 border-border pl-3 mt-1 space-y-1">
                                    {lessonParts.map((part) => (
                                      <button
                                        key={part.id}
                                        onClick={() => togglePart(part)}
                                        className={cn(
                                          "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors cursor-pointer",
                                          part.is_done
                                            ? "text-muted-foreground"
                                            : "text-foreground hover:bg-muted/50",
                                        )}
                                      >
                                        {part.is_done
                                          ? <CheckSquare className="h-3.5 w-3.5 shrink-0 text-success" />
                                          : <Square className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                                        <span className={cn(part.is_done && "line-through")}>
                                          {part.name}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {lessons.length === 0 && isMember && userSubjects.length > 1 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <ListChecks className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Switch Subject</p>
                    <p className="text-xs text-muted-foreground">
                      Choose which subject to work on in this room
                    </p>
                  </div>
                  <div className="relative">
                    <select
                      value={activeSubjectId ?? ""}
                      onChange={(e) => {
                        const newId = e.target.value;
                        setActiveSubjectId(newId);
                        loadLessons(newId);
                      }}
                      className="appearance-none rounded-lg border border-border bg-muted px-3 py-2 pr-7 text-sm font-medium text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {userSubjects.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
