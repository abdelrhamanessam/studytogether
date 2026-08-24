"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RoomMember } from "@/types";

interface UseRealtimeRoomOptions {
  roomId: string;
}

interface UseRealtimeRoomReturn {
  members: RoomMember[];
  refreshMembers: () => Promise<void>;
}

export function useRealtimeRoom({
  roomId,
}: UseRealtimeRoomOptions): UseRealtimeRoomReturn {
  const [members, setMembers] = useState<RoomMember[]>([]);
  const supabase = useRef(createClient());

  const refreshMembers = useCallback(async () => {
    if (!roomId) return;
    const { data } = await supabase.current
      .from("room_members")
      .select("*, profiles:user_id(*)")
      .eq("room_id", roomId)
      .order("joined_at", { ascending: true });

    if (data) {
      setMembers(data as RoomMember[]);
    }
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;

    refreshMembers();

    const channel = supabase.current
      .channel(`room-members-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_members",
          filter: `room_id=eq.${roomId}`,
        },
        async () => {
          await refreshMembers();
        },
      )
      .subscribe();

    return () => {
      supabase.current.removeChannel(channel);
    };
  }, [roomId, refreshMembers]);

  return { members, refreshMembers };
}
