"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users, Loader2, Copy, Crown, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import type { Group, GroupMember } from "@/types";

type GroupDetails = Group & {
  member_count?: number;
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

  useEffect(() => {
    params.then((p) => setCode(p.code));
  }, [params]);

  const loadMembers = useCallback(async (groupId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("group_members")
      .select("*, profiles:user_id(*)")
      .eq("group_id", groupId)
      .order("joined_at", { ascending: true });
    if (data) setMembers((data as GroupMember[]) ?? []);
  }, []);

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
          {joinError && (
            <p className="text-sm text-red-500">{joinError}</p>
          )}
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
        <>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">
                Share the code <span className="font-mono font-semibold text-foreground">{group.code}</span>{" "}
                with your friends — they can join from the Groups page.
              </p>
            </CardContent>
          </Card>

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
                return (
                  <div
                    key={member.id}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-3",
                      member.user_id === userId
                        ? "border-primary/30 bg-primary/5"
                        : "border-border bg-card",
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
                      <div className="mt-1 flex items-center gap-2">
                        <Badge
                          variant={member.role === "owner" ? "accent" : "secondary"}
                          size="sm"
                          className="gap-1"
                        >
                          {member.role === "owner" && <Crown className="h-3 w-3" />}
                          {member.role === "owner" ? "Owner" : "Member"}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          Joined{" "}
                          {new Date(member.joined_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}