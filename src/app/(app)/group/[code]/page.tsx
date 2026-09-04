"use client";

import { useState, useEffect, useCallback } from "react";
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
  ChevronDown,
  LogOut,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDurationShort } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import type { Group, GroupMember } from "@/types";

interface MemberDetail extends GroupMember {
  member_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  level: number;
  role: string;
  today_seconds: number;
}

export default function GroupDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<MemberDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

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

      const { data: memberData, error: memberError } = await supabase.rpc(
        "get_group_details",
        { p_group_id: groupData.id },
      );

      if (!memberError && memberData) {
        setMembers(
          (memberData as MemberDetail[]).sort(
            (a, b) => (b.today_seconds ?? 0) - (a.today_seconds ?? 0),
          ),
        );
      }
    } catch (err) {
      console.error("Failed to load group:", err);
    } finally {
      setLoading(false);
    }
  }, [code, router]);

  useEffect(() => {
    loadGroup();
  }, [loadGroup]);

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

  const sorted = [...members].sort(
    (a, b) => (b.today_seconds ?? 0) - (a.today_seconds ?? 0),
  );

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
      </div>

      {group.description && (
        <p className="text-sm text-muted-foreground animate-fade-in">
          {group.description}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Users className="h-4 w-4" />
            Members ({members.length})
          </h2>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            {members.map((member) => (
              <div
                key={member.member_id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3 transition-all",
                  member.member_id === currentUserId
                    ? "border-primary/30 bg-primary/5"
                    : "border-border bg-card",
                )}
              >
                <Avatar
                  src={member.avatar_url}
                  alt={member.display_name}
                  fallback={member.display_name ?? "?"}
                  size="md"
                  showLevelRing
                  level={member.level}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {member.display_name ?? member.username ?? "Unknown"}
                      {member.member_id === currentUserId && (
                        <span className="text-muted-foreground"> (you)</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge
                      variant={member.role === "owner" ? "accent" : "secondary"}
                      size="sm"
                      className="gap-1"
                    >
                      {member.role === "owner" && (
                        <Crown className="h-3 w-3" />
                      )}
                      {member.role === "owner" ? "Owner" : "Member"}
                    </Badge>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDurationShort(member.today_seconds ?? 0)}
                      <span className="text-[11px] opacity-70">today</span>
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {members.length === 0 && (
              <div className="col-span-full py-8 text-center text-sm text-muted-foreground">
                No members yet.
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
                  {sorted.map((member, index) => (
                    <div
                      key={member.member_id}
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
                        src={member.avatar_url}
                        alt={member.display_name}
                        fallback={member.display_name ?? "?"}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="truncate text-sm font-medium block">
                          {member.display_name ?? "Unknown"}
                        </span>
                      </div>
                      <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground shrink-0">
                        <Clock className="h-3 w-3" />
                        {formatDurationShort(member.today_seconds ?? 0)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
