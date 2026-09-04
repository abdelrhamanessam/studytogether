"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  Loader2,
  Copy,
  Crown,
  Clock,
  Trophy,
  Zap,
  BookOpen,
  LogOut,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, formatTimer } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { useRealtimeGroup } from "@/hooks/use-realtime-group";
import { GroupStudyPanel, focusDurationFor } from "@/components/group-study-panel";
import type { Group, GroupMember, StudyMethod } from "@/types";
import { STUDY_METHODS } from "@/types";

const STATUS_BADGE: Record<string, { variant: BadgeVariant; label: string }> = {
  focusing: { variant: "success", label: "Focusing" },
  break: { variant: "warning", label: "On Break" },
  paused: { variant: "muted", label: "Paused" },
  idle: { variant: "muted", label: "Idle" },
  finished: { variant: "default", label: "Finished" },
};

export default function GroupDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [memberTick, setMemberTick] = useState(0);
  const [joinState, setJoinState] = useState<"checking" | "member" | "full">("checking");
  const joinedCheckedRef = useRef(false);

  useEffect(() => {
    params.then((p) => setCode(p.code));
  }, [params]);

  const loadGroup = useCallback(async () => {
    if (!code) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setCurrentUserId(user.id);

      const { data: groupData, error: groupError } = await supabase
        .from("groups")
        .select("*")
        .eq("code", code)
        .single();

      if (groupError || !groupData) {
        setGroup(null);
        setLoading(false);
        return;
      }

      setGroup(groupData as Group);
    } catch (err) {
      console.error("Failed to load group:", err);
    } finally {
      setLoading(false);
    }
  }, [code, router]);

  useEffect(() => {
    loadGroup();
  }, [loadGroup]);

  const { members, refreshMembers } = useRealtimeGroup({
    groupId: group?.id ?? "",
  });

  const isMember = joinState === "member";
  const currentMember = members.find((m) => m.user_id === currentUserId) ?? null;

  // Auto-join: opening a group page puts you inside directly.
  useEffect(() => {
    if (!group || !currentUserId || joinedCheckedRef.current) return;
    joinedCheckedRef.current = true;
    (async () => {
      const supabase = createClient();
      const { data: membership } = await supabase
        .from("group_members")
        .select("id")
        .eq("group_id", group.id)
        .eq("user_id", currentUserId)
        .maybeSingle();

      if (membership) {
        setJoinState("member");
        return;
      }

      const { count } = await supabase
        .from("group_members")
        .select("id", { count: "exact", head: true })
        .eq("group_id", group.id);
      if ((count ?? 0) >= group.max_members) {
        setJoinState("full");
        return;
      }

      const { error } = await supabase.from("group_members").insert({
        group_id: group.id,
        user_id: currentUserId,
        role: "member",
      });
      if (error) {
        console.error("Auto-join error:", error.message, error.code, error.details);
      }
      setJoinState("member");
      await refreshMembers();
    })();
  }, [group, currentUserId, refreshMembers]);

  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const effectiveAccumulated = useCallback(
    (member: { accumulated_seconds?: number | null; last_active_date?: string | null }) =>
      member.last_active_date === todayKey() ? (member.accumulated_seconds ?? 0) : 0,
    [],
  );

  const hasActiveMembers = members.some((m) => m.status === "focusing");

  useEffect(() => {
    if (!hasActiveMembers) return;
    const id = setInterval(() => setMemberTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasActiveMembers]);

  const handleLeave = async () => {
    if (!group || !currentUserId || leaving) return;
    setLeaving(true);
    try {
      const supabase = createClient();
      await supabase
        .from("group_members")
        .delete()
        .eq("group_id", group.id)
        .eq("user_id", currentUserId);
      router.push("/groups");
    } catch (err) {
      console.error("Failed to leave group:", err);
      setLeaving(false);
    }
  };

  const handleCopyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard failures
    }
  };

  if (loading || !code) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <h2 className="text-xl font-bold">Group not found</h2>
        <p className="text-sm text-muted-foreground">
          This group may have been deleted or the code is invalid.
        </p>
        <Link href="/groups">
          <Button>Browse Groups</Button>
        </Link>
      </div>
    );
  }

  const sorted = [...members].sort((a, b) => {
    const aTime =
      effectiveAccumulated(a) +
      (a.status === "focusing" && a.session_started_at
        ? Math.floor((Date.now() - new Date(a.session_started_at).getTime()) / 1000)
        : 0);
    const bTime =
      effectiveAccumulated(b) +
      (b.status === "focusing" && b.session_started_at
        ? Math.floor((Date.now() - new Date(b.session_started_at).getTime()) / 1000)
        : 0);
    return bTime - aTime;
  });

  const memberTimeFor = (member: GroupMember): string => {
    const memberMethod = (member.study_method in STUDY_METHODS
      ? member.study_method
      : "pomodoro") as StudyMethod;
    const isCountUp = memberMethod === "stopwatch" || memberMethod === "target";
    if (member.status === "focusing" && member.session_started_at) {
      const elapsed = Math.floor(
        (Date.now() - new Date(member.session_started_at).getTime()) / 1000,
      );
      const acc = effectiveAccumulated(member);
      return formatTimer(
        isCountUp
          ? acc + elapsed
          : Math.max(0, acc - focusDurationFor(memberMethod) + elapsed),
      );
    }
    return formatTimer(effectiveAccumulated(member));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/groups">
            <Button variant="ghost" size="sm" className="gap-1 shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">
              {group.name}
            </h1>
            <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3 shrink-0" />
                {members.length} / {group.max_members}
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="inline-flex items-center rounded-lg border border-border bg-muted/50 px-2.5 py-1 text-xs font-mono font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
                title="Copy group code"
              >
                <Copy className="h-3 w-3 mr-1.5 text-primary" />
                {copied ? "Copied!" : group.code}
              </button>
            </div>
          </div>
        </div>
        {joinState === "member" && (
          <Button
            variant="danger"
            size="sm"
            onClick={handleLeave}
            loading={leaving}
            className="gap-1 shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Leave</span>
          </Button>
        )}
      </div>

      {group.description && (
        <p className="text-sm text-muted-foreground animate-fade-in">
          {group.description}
        </p>
      )}

      {joinState === "full" ? (
        <Card className="flex flex-col items-center gap-4 py-12">
          <Users className="h-12 w-12 text-danger" />
          <div className="text-center">
            <h3 className="text-lg font-semibold">This group is full</h3>
            <p className="text-sm text-muted-foreground">
              The member limit has been reached.
            </p>
          </div>
          <Link href="/groups">
            <Button variant="secondary">Browse Groups</Button>
          </Link>
        </Card>
      ) : joinState === "checking" ? (
        <div className="flex h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            {currentMember ? (
              <GroupStudyPanel
                groupId={group.id}
                userId={currentUserId!}
                member={currentMember}
              />
            ) : (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}

            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Users className="h-4 w-4" />
              Members ({members.length})
            </h2>
            <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-2">
              {members.map((member) => {
                const profile = member.profiles;
                const memberMethod = (member.study_method in STUDY_METHODS
                  ? member.study_method
                  : "pomodoro") as StudyMethod;
                const statusInfo =
                  STATUS_BADGE[member.status] ?? STATUS_BADGE.idle;

                return (
                  <div
                    key={member.id}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-3 transition-all",
                      member.user_id === currentUserId
                        ? "border-primary/30 bg-primary/5"
                        : "border-border bg-card",
                      member.status === "focusing" && "border-success/20 bg-success/5",
                    )}
                  >
                    <Avatar
                      src={profile?.avatar_url}
                      alt={profile?.display_name ?? profile?.username ?? ""}
                      fallback={profile?.display_name ?? profile?.username ?? "?"}
                      size="md"
                      showLevelRing={
                        member.status === "focusing" && member.user_id !== currentUserId
                      }
                      level={profile?.level}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {profile?.display_name ?? profile?.username ?? "Unknown"}
                          {member.user_id === currentUserId && (
                            <span className="text-muted-foreground"> (you)</span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <Badge variant={statusInfo.variant} size="sm">
                          {statusInfo.label}
                        </Badge>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {memberTimeFor(member)}
                          <span className="ml-1 text-[11px] opacity-70">today</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant={member.role === "owner" ? "accent" : "secondary"} size="sm" className="gap-1">
                          {member.role === "owner" && <Crown className="h-3 w-3" />}
                          {member.role === "owner" ? "Owner" : "Member"}
                        </Badge>
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <BookOpen className="h-3 w-3" />
                          {STUDY_METHODS[memberMethod].label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {members.length === 0 && (
                <div className="col-span-full py-8 text-center text-sm text-muted-foreground">
                  No members yet. Be the first to join!
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Trophy className="h-4 w-4" />
              Leaderboard
            </h2>
            <Card>
              <CardContent className="p-0">
                {sorted.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No data yet
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {sorted.map((member, index) => {
                      const aTime =
                        effectiveAccumulated(member) +
                        (member.status === "focusing" && member.session_started_at
                          ? Math.floor((Date.now() - new Date(member.session_started_at).getTime()) / 1000)
                          : 0);
                      return (
                        <div
                          key={member.id}
                          className={cn(
                            "flex items-center gap-3 px-4 py-3",
                            index < 3 && "bg-muted/30",
                          )}
                        >
                          <span
                            className={cn(
                              "w-6 text-center text-sm font-bold",
                              index === 0 && "text-amber-500",
                              index === 1 && "text-gray-400",
                              index === 2 && "text-amber-700",
                              index > 2 && "text-muted-foreground",
                            )}
                          >
                            {index + 1}
                          </span>
                          <Avatar
                            src={member.profiles?.avatar_url}
                            alt={member.profiles?.display_name ?? member.profiles?.username ?? ""}
                            fallback={member.profiles?.display_name ?? member.profiles?.username ?? "?"}
                            size="sm"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="truncate text-sm font-medium block">
                              {member.profiles?.display_name ?? member.profiles?.username ?? "Unknown"}
                            </span>
                          </div>
                          <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground shrink-0">
                            <Clock className="h-3 w-3" />
                            {formatTimer(aTime)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {currentMember && (
              <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                <Zap className="h-4 w-4 text-primary shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Your time today:{" "}
                  <span className="font-semibold text-foreground">
                    {formatTimer(effectiveAccumulated(currentMember))}
                  </span>
                  {currentMember.status === "focusing" && " (counting up…)"}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}