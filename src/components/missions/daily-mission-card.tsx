"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Flag,
  Rocket,
  Flame,
  Plus,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DAILY_MISSION_XP,
  MISSION_HINTS,
  MISSION_SIZES,
  type MissionSize,
} from "@/lib/xp";
import type { DailyMission } from "@/types";

const SIZE_ICON: Record<MissionSize, typeof Flag> = {
  small: Flag,
  medium: Rocket,
  large: Flame,
};

const SIZE_BADGE: Record<MissionSize, string> = {
  small: "bg-slate-500/15 text-slate-300",
  medium: "bg-blue-500/15 text-blue-400",
  large: "bg-amber-500/15 text-amber-400",
};

export default function DailyMissionCard() {
  const supabase = createClient();
  const [missions, setMissions] = useState<DailyMission[]>([]);
  const [title, setTitle] = useState("");
  const [size, setSize] = useState<MissionSize>("small");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [awarded, setAwarded] = useState<number | null>(null);

  const fetchMissions = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("daily_missions")
      .select("*")
      .eq("date", today)
      .order("created_at", { ascending: true });
    if (data) setMissions(data as DailyMission[]);
  }, [supabase]);

  useEffect(() => {
    fetchMissions();
  }, [fetchMissions]);

  async function addMission() {
    if (!title.trim() || busy) return;
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("daily_missions")
      .insert({
        user_id: user.id,
        date: today,
        title: title.trim(),
        size,
        xp_reward: DAILY_MISSION_XP[size],
      })
      .select()
      .single();
    if (data) {
      setMissions((m) => [...m, data as DailyMission]);
      setTitle("");
    }
    setBusy(false);
  }

  async function completeMission(m: DailyMission) {
    if (m.completed || busy) return;
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      return;
    }

    await supabase
      .from("daily_missions")
      .update({ completed: true, completed_at: new Date().toISOString() })
      .eq("id", m.id);

    await supabase.rpc("award_xp", {
      p_user_id: user.id,
      p_amount: m.xp_reward,
      p_reason: `Daily mission: ${m.title}`,
      p_session_id: null,
    });

    setMissions((ms) =>
      ms.map((x) => (x.id === m.id ? { ...x, completed: true, completed_at: new Date().toISOString() } : x)),
    );
    setAwarded(m.xp_reward);
    setTimeout(() => setAwarded(null), 4000);
    setBusy(false);
  }

  async function deleteMission(m: DailyMission) {
    if (busy) return;
    setBusy(true);
    await supabase.from("daily_missions").delete().eq("id", m.id);
    setMissions((ms) => ms.filter((x) => x.id !== m.id));
    setBusy(false);
  }

  const openCount = missions.filter((m) => !m.completed).length;

  return (
    <Card className="border-primary/25">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Flag size={16} className="text-primary" />
            Today&apos;s Missions
          </span>
          {openCount > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              {openCount} open
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {awarded != null && (
          <p className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs text-emerald-400 font-medium">
            +{awarded} XP awarded!
          </p>
        )}

        {missions.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No missions yet. Add one to earn extra XP today.
          </p>
        )}

        <div className="space-y-2">
          {missions.map((m) => {
            const Icon = SIZE_ICON[m.size];
            return (
              <div
                key={m.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3",
                  m.completed ? "border-border bg-muted/30" : "border-border",
                )}
              >
                <button
                  type="button"
                  onClick={() => completeMission(m)}
                  disabled={m.completed || busy}
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors cursor-pointer disabled:cursor-default",
                    m.completed
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-muted-foreground/40 hover:border-primary hover:text-primary",
                  )}
                  aria-label={m.completed ? "Completed" : "Complete mission"}
                >
                  {m.completed && <CheckCircle2 size={14} />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm font-medium", m.completed && "line-through text-muted-foreground")}>
                    {m.title}
                  </p>
                  <p className="text-xs text-muted-foreground">+{m.xp_reward} XP</p>
                </div>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", SIZE_BADGE[m.size])}>
                  {m.size}
                </span>
                {!m.completed && (
                  <button
                    type="button"
                    onClick={() => deleteMission(m)}
                    className="cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Delete mission"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex gap-1.5">
            {MISSION_SIZES.map((s) => {
              const Icon = SIZE_ICON[s];
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  className={cn(
                    "flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors",
                    size === s
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted/50",
                  )}
                >
                  <Icon size={12} />
                  {s}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {MISSION_HINTS[size]} · +{DAILY_MISSION_XP[size]} XP
          </p>
          <div className="flex gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addMission();
              }}
              placeholder="What should you do today?"
              className="flex-1"
            />
            <Button
              type="button"
              size="md"
              className="px-3"
              onClick={addMission}
              loading={busy}
              aria-label="Add mission"
            >
              <Plus size={16} />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
