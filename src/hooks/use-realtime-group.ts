"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { GroupMember } from "@/types";

interface UseRealtimeGroupOptions {
  groupId: string;
}

interface UseRealtimeGroupReturn {
  members: GroupMember[];
  refreshMembers: () => Promise<void>;
}

export function useRealtimeGroup({
  groupId,
}: UseRealtimeGroupOptions): UseRealtimeGroupReturn {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const supabase = useRef(createClient());
  const pendingRequestId = useRef(0);

  const refreshMembers = useCallback(async () => {
    if (!groupId) return;
    const requestId = ++pendingRequestId.current;
    const { data } = await supabase.current
      .from("group_members")
      .select("*, profiles:user_id(*)")
      .eq("group_id", groupId)
      .order("joined_at", { ascending: true });

    if (requestId !== pendingRequestId.current) return;
    if (data) {
      setMembers(data as GroupMember[]);
    }
  }, [groupId]);

  useEffect(() => {
    if (!groupId) return;

    refreshMembers();

    const channel = supabase.current
      .channel(`group-members-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_members",
          filter: `group_id=eq.${groupId}`,
        },
        async () => {
          await refreshMembers();
        },
      )
      .subscribe();

    return () => {
      supabase.current.removeChannel(channel);
    };
  }, [groupId, refreshMembers]);

  return { members, refreshMembers };
}