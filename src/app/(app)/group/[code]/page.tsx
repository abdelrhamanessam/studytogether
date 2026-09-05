"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users, Loader2, Copy, Crown, Clock, Zap, Trophy, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, formatTimer } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { GroupStudyPanel } from "@/components/group-study-panel";
import type { Group, GroupMember, StudyMethod } from "@/types";
import { STUDY_METHODS } from "@/types";

type GroupDetails = Group & {
  member_count?: number;
};

const STATUS_BADGE: Record<string, { variant: BadgeVariant; label: string }> = {
  focusing: { variant: "success", label: "Focusing" },
  break: { variant: "warning", label: "On Break" },
  paused: { variant: "muted", label: "Paused" },
  finished: { variant: "default", label: "Finished" },
  idle: { variant: "muted", label: "Idle" },
};

export default function GroupDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [group, setGroup] = useState<GroupDetails | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [status, setStatus] = useState<"loading" | "anon" | "member">("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [memberTick, setMemberTick] = useState(0);
  const [todayTotals, setTodayTotals] = useState<Record<string, number>>({});

  useEffect(() => {
    params.then((p) => setCode(p.code));
  }, [params]);

  const liveSeconds = useCallback(
    (m: { status?: string; session_started_at?: string | null }) => {
      if (m.status === "focusing" && m.session_started_at) {
        return Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(m.session_started_at).getTime()) / 1000,
          ),
        );
      }
      return 0;
    },
    [],
  );

  const todaySecondsFor = useCallback(
    (m: GroupMember) => (todayTotals[m.user_id] ?? 0) + liveSeconds(m),
    [todayTotals, liveSeconds],
  );

  const fetchTodayTotals = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const supabase = createClient();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const { data } = await supabase
      .from("study_sessions")
      .select("user_id, actual_duration")
      .in("user_id", ids)
      .gte("started_at", start.toISOString())
      .lt("started_at", end.toISOString())
      .eq("status", "completed");
    if (!data) return;
    const totals: Record<string, number> = {};
    for (const row of data) {
      totals[row.user_id] = (totals[row.user_id] ?? 0) + (row.actual_duration ?? 0);
    }
    setTodayTotals(totals);
  }, []);

  const loadMembers = useCallback(
    async (groupId: string) => {
      const supabase = createClient();
      const { data } = await supabase
        .from("group_members")
        .select("*, profiles:user_id(*)")
        .eq("group_id", groupId)
        .order("joined_at", { ascending: true });
      const rows = (data as GroupMember[]) ?? [];
      setMembers(rows);
      void fetchTodayTotals(rows.map((m) => m.user_id));
    },
    [fetchTodayTotals],
  );

  const loadGroup = useCallback(async () => {
    if (!code) return;
    setLoading(true);
    setStatus("loading");
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUserId(user.id);

      const { data: g } = await supabase.rpc("get_group_details", {
        p_code: code,
      });
      if (!g || g.length === 0) {
        setGroup(null);
        setLoading(false);
        return;
      }
      const details = (g[0] as GroupDetails) ?? null;
      setGroup(details);

      const { data: membership } = await supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", details.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (membership) {
        setStatus("member");
        await loadMembers(details.id);
      } else {
        setStatus("anon");
      }
    } catch {
      setGroup(null);
    } finally {
      setLoading(false);
    }
  }, [code, router, loadMembers]);

  useEffect(() => {
    loadGroup();
  }, [loadGroup]);

  useEffect(() => {
    if (status !== "member" || !group) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`group-members-${group.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_members",
          filter: `group_id=eq.${group.id}`,
        },
        () => {
          void loadMembers(group.id);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [status, group, loadMembers]);

  const hasActiveMembers = members.some((m) => m.status === "focusing");

  useEffect(() => {
    if (!hasActiveMembers) return;
    const id = setInterval(() => setMemberTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasActiveMembers]);

  const handleJoin = async () => {
    if (!group || !userId || joining) return;
    setJoining(true);
    setJoinError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("group_members").insert({
        group_id: group.id,
        user_id: userId,
        role: "member",
      });
      if (error && error.code !== "23505") {
        setJoinError(error.message);
        return;
      }
      setStatus("member");
      await loadMembers(group.id);
    } catch {
      setJoinError("Something went wrong. Try again.");
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    if (!group || !userId || leaving) return;
    setLeaving(true);
    try {
      const supabase = createClient();
      await supabase
        .from("group_members")
        .delete()
        .eq("group_id", group.id)
        .eq("user_id", userId);
      router.push("/groups");
    } catch {
      setLeaving(false);
    }
  };

  const handleCopyCode = async () => {
    if (!group) return;
    try {
      await navigator.clipboard.writeText(group.code);
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

  const isFull = (group.member_count ?? 0) >= group.max_members;
  const currentMember =
    members.find((m) => m.user_id === userId) ?? null;
  const sorted = [...members].sort(
    (a, b) => todaySecondsFor(b) - todaySecondsFor(a),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/groups">
            <Button variant="ghost" size="sm" className="gap-1 shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">
              {group.name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {group.member_count ?? 0} / {group.max_members} members
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="inline-flex items-center rounded-lg border border-border bg-muted/50 px-2 py-1 font-mono font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
                title="Copy invite code"
              >
                <Copy className="h-3 w-3 mr-1 text-primary" />
                {copied ? "Copied!" : group.code}
              </button>
            </div>
          </div>
        </div>
        {status === "member" && (
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
        <p className="text-sm text-muted-foreground">{group.description}</p>
      )}

      {status === "anon" ? (
        <Card className="flex flex-col items-center gap-4 py-12 text-center">
          <Users className="h-12 w-12 text-primary" />
          <div>
            <h3 className="text-lg font-semibold">You are not in this group</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Join to see the members and study together.
            </p>
          </div>
          {joinError && <p className="text-sm text-red-500">{joinError}</p>}
          <Button
            size="lg"
            onClick={handleJoin}
            loading={joining}
            disabled={isFull}
            className="gap-2 px-10"
          >
            {isFull ? "This group is full" : "Join Group"}
          </Button>
          <Link href="/groups">
            <Button variant="ghost" size="sm">
              Back to groups
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            {currentMember ? (
              <GroupStudyPanel
                key={currentMember.user_id}
                groupId={group.id}
                userId={currentMember.user_id}
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
            {members.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No members yet. Share the code to invite people.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-2">
                {members.map((member) => {
                  const profile = member.profiles;
                  const memberMethod =
                    (member.study_method as StudyMethod) in STUDY_METHODS
                      ? (member.study_method as StudyMethod)
                      : "pomodoro";
                  const statusInfo =
                    STATUS_BADGE[member.status] ?? STATUS_BADGE.idle;
                  const studied = todaySecondsFor(member);
                  return (
                    <div
                      key={member.id}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border p-3 transition-all",
                        member.user_id === userId
                          ? "border-primary/30 bg-primary/5"
                          : "border-border bg-card",
                        member.status === "focusing" &&
                          "border-success/20 bg-success/5",
                      )}
                    >
                      <Avatar
                        src={profile?.avatar_url}
                        alt={profile?.display_name ?? profile?.username ?? ""}
                        fallback={profile?.display_name ?? profile?.username ?? "?"}
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {profile?.display_name ?? profile?.username ?? "Unknown"}
                            {member.user_id === userId && (
                              <span className="text-muted-foreground"> (you)</span>
                            )}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          <Badge variant={statusInfo.variant} size="sm">
                            {statusInfo.label}
                          </Badge>
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            {STUDY_METHODS[memberMethod].label}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="flex items-center gap-1 text-sm font-semibold tabular-nums text-foreground">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                          {formatTimer(studied)}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          today
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Trophy className="h-4 w-4" />
              Today&apos;s Focus
            </h2>
            <Card>
              <CardContent className="p-0">
                {sorted.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No data yet
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {sorted.map((member, index) => (
                      <div
                        key={member.id}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3",
                          index === 0 && "bg-muted/30",
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
                          {formatTimer(todaySecondsFor(member))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {currentMember && (
              <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                <Zap className="h-4 w-4 text-primary shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Your focus today:{" "}
                  <span className="font-semibold text-foreground">
                    {formatTimer(todaySecondsFor(currentMember))}
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