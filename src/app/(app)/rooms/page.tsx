"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  Users,
  Clock,
  BookOpen,
  Filter,
  Loader2,
  DoorOpen,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { STUDY_METHODS, type StudyMethod, type Room } from "@/types";

type RoomWithMembers = Room & {
  room_members: { count: number }[];
  subjects?: { name: string; color: string } | null;
  profiles?: { display_name: string } | null;
};

const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "popular", label: "Popular" },
  { key: "pomodoro", label: "Pomodoro" },
  { key: "deep_focus", label: "Deep Focus" },
  { key: "custom", label: "Custom" },
] as const;

type FilterKey = (typeof FILTER_TABS)[number]["key"];

const METHOD_BADGE: Record<StudyMethod, string> = {
  pomodoro: "Pomodoro",
  long_pomodoro: "Long Pomodoro",
  deep_focus: "Deep Focus",
  custom: "Custom",
  stopwatch: "Stopwatch",
  target: "Study Target",
};

export default function RoomsPage() {
  const [rooms, setRooms] = useState<RoomWithMembers[]>([]);
  const [filtered, setFiltered] = useState<RoomWithMembers[]>([]);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [loading, setLoading] = useState(true);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("rooms")
      .select(
        "*, room_members(count), subjects(name, color), profiles:owner_id(display_name)",
      )
      .eq("is_public", true)
      .order("created_at", { ascending: false });

    setRooms((data as unknown as RoomWithMembers[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  useEffect(() => {
    let result = rooms;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q),
      );
    }

    if (activeFilter === "popular") {
      result = [...result].sort((a, b) => {
        const aCount = a.room_members?.[0]?.count ?? 0;
        const bCount = b.room_members?.[0]?.count ?? 0;
        return bCount - aCount;
      });
    } else if (activeFilter === "pomodoro") {
      result = result.filter(
        (r) => r.study_method === "pomodoro" || r.study_method === "long_pomodoro",
      );
    } else if (activeFilter === "deep_focus") {
      result = result.filter((r) => r.study_method === "deep_focus");
    } else if (activeFilter === "custom") {
      result = result.filter(
        (r) =>
          r.study_method === "custom" ||
          r.study_method === "stopwatch" ||
          r.study_method === "target",
      );
    }

    setFiltered(result);
  }, [rooms, search, activeFilter]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Study Rooms</h1>
          <p className="text-sm text-muted-foreground">
            Join a room and study with others
          </p>
        </div>
        <Link href="/rooms/create">
          <Button size="lg" className="gap-2">
            <Plus className="h-5 w-5" />
            Create Room
          </Button>
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search rooms..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveFilter(tab.key)}
            className={cn(
              "whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-all",
              activeFilter === tab.key
                ? "bg-primary text-white shadow-md shadow-primary/20"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20">
          <DoorOpen className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-semibold">No rooms found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {search
              ? "Try a different search term"
              : "Be the first to create a study room"}
          </p>
          {!search && (
            <Link href="/rooms/create" className="mt-4">
              <Button>Create Room</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((room) => {
            const memberCount = room.room_members?.[0]?.count ?? 0;
            const studyConf = STUDY_METHODS[room.study_method as StudyMethod];

            return (
              <Link key={room.id} href={`/room/${room.code}`}>
                <Card
                  glow
                  className="h-full cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:border-primary/30"
                >
                  <CardContent className="flex flex-col gap-3 p-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-semibold leading-tight">
                        {room.name}
                      </h3>
                      <Badge
                        variant={
                          room.study_method.includes("pomodoro")
                            ? "default"
                            : room.study_method === "deep_focus"
                              ? "accent"
                              : "secondary"
                        }
                        size="sm"
                      >
                        {METHOD_BADGE[room.study_method as StudyMethod]}
                      </Badge>
                    </div>

                    {room.description && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {room.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {memberCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {studyConf.label}
                      </span>
                      {room.subjects?.name && (
                        <span className="flex items-center gap-1">
                          <BookOpen className="h-3.5 w-3.5" />
                          {room.subjects.name}
                        </span>
                      )}
                    </div>

                    <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
                      <span className="text-xs text-muted-foreground">
                        by {room.profiles?.display_name ?? "Unknown"}
                      </span>
                      <Button size="sm" variant="secondary">
                        Join Room
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
