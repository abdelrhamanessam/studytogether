"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Users, Loader2, DoorOpen, Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { Group } from "@/types";

export default function GroupsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("group_members")
      .select("groups(*)")
      .eq("user_id", user.id);

    const userGroups = (data ?? [])
      .map((row: any) => row.groups as Group | null)
      .filter((g): g is Group => Boolean(g));

    setGroups(userGroups);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleJoinByCode = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setJoinError("Enter a group code to join.");
      return;
    }
    setJoinError("");
    setJoining(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("find_group_by_code", {
        p_code: code,
      });
      if (error || !data || data.length === 0) {
        setJoinError("Group not found. Check the code and try again.");
        setJoining(false);
        return;
      }
      router.push(`/group/${code}`);
    } catch {
      setJoinError("Something went wrong. Try again.");
      setJoining(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Study Groups</h1>
          <p className="text-sm text-muted-foreground">
            Create or join a study group
          </p>
        </div>
        <Link href="/groups/create">
          <Button size="lg" className="gap-2">
            <Plus className="h-5 w-5" />
            Create Group
          </Button>
        </Link>
      </div>

      <Card className="animate-fade-in border-border bg-card/60">
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
              <DoorOpen size={15} className="text-primary" />
              Join a group with a code
            </label>
            <Input
              placeholder="e.g. ABC123"
              value={joinCode}
              onChange={(e) => {
                setJoinCode(e.target.value.toUpperCase());
                if (joinError) setJoinError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleJoinByCode();
              }}
              maxLength={12}
            />
            {joinError && (
              <p className="mt-1.5 text-xs text-red-500">{joinError}</p>
            )}
          </div>
          <Button
            onClick={handleJoinByCode}
            loading={joining}
            className="gap-2 shrink-0"
          >
            <DoorOpen className="h-4 w-4" />
            Join Group
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          My groups
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20">
          <Users className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-semibold">No groups yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create one to get started!
          </p>
          <Link href="/groups/create" className="mt-4">
            <Button>Create Group</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <Link key={group.id} href={`/group/${group.code}`}>
              <Card
                glow
                className="h-full cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:border-primary/30"
              >
                <CardContent className="flex flex-col gap-3 p-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold leading-tight">
                      {group.name}
                    </h3>
                    <Badge variant="secondary" size="sm" className="gap-1 shrink-0 font-mono">
                      <Copy className="h-3 w-3" />
                      {group.code}
                    </Badge>
                  </div>

                  {group.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {group.description}
                    </p>
                  )}

                  <div className="mt-auto border-t border-border pt-3">
                    <Button size="sm" variant="secondary" className="w-full">
                      View Group
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}