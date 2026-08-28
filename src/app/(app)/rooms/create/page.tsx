"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { STUDY_METHODS, type StudyMethod, type Subject } from "@/types";
import { calculateSessionXp } from "@/lib/xp";
import {
  ArrowLeft,
  Clock,
  Timer,
  Target,
  Settings2,
  Users,
  BookOpen,
  Zap,
} from "lucide-react";
import Link from "next/link";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50),
  description: z.string().max(200).optional().or(z.literal("")),
  subject_id: z.string().optional().or(z.literal("")),
  study_method: z.enum(["pomodoro", "long_pomodoro", "deep_focus", "custom", "stopwatch", "target"]),
  study_duration: z.number().min(60).max(14400).optional(),
  break_duration: z.number().min(30).max(3600).optional(),
  cycles: z.number().min(1).max(20).optional(),
  target_duration: z.number().min(60).max(28800).optional(),
  is_public: z.boolean(),
});

type FormData = z.infer<typeof schema>;

const METHOD_OPTIONS: { value: StudyMethod; label: string; description: string; icon: React.ReactNode }[] = [
  { value: "pomodoro", label: "Pomodoro", description: "25 min focus / 5 min break", icon: <Timer className="h-5 w-5" /> },
  { value: "long_pomodoro", label: "Long Pomodoro", description: "50 min focus / 10 min break", icon: <Clock className="h-5 w-5" /> },
  { value: "deep_focus", label: "Deep Focus", description: "90 min focus / 15 min break", icon: <BookOpen className="h-5 w-5" /> },
  { value: "custom", label: "Custom", description: "Set your own durations", icon: <Settings2 className="h-5 w-5" /> },
  { value: "stopwatch", label: "Stopwatch", description: "Count up, no limit", icon: <Timer className="h-5 w-5" /> },
  { value: "target", label: "Study Target", description: "Count up to a goal", icon: <Target className="h-5 w-5" /> },
];

export default function CreateRoomPage() {
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      description: "",
      subject_id: "",
      study_method: "pomodoro",
      is_public: true,
      study_duration: 25 * 60,
      break_duration: 5 * 60,
      cycles: 4,
      target_duration: 3600,
    },
  });

  const selectedMethod = watch("study_method");
  const selectedDuration = watch("study_duration");
  const selectedCycles = watch("cycles");

  const methodConfig = STUDY_METHODS[selectedMethod];
  const focusDuration = selectedMethod === "custom"
    ? (selectedDuration ?? methodConfig?.studyDuration ?? 1500)
    : (methodConfig?.studyDuration ?? 1500);
  const cycleCount = selectedMethod === "target" || selectedMethod === "stopwatch"
    ? 1
    : selectedMethod === "custom"
      ? (selectedCycles ?? 4)
      : (methodConfig?.cycles ?? 4);
  const perCycleXp = calculateSessionXp(
    Math.floor(focusDuration / 60),
    selectedMethod === "target" ? undefined : Math.floor(focusDuration / 60),
  );
  const totalXp = perCycleXp.totalXp * cycleCount;
  const isPublic = watch("is_public");

  useEffect(() => {
    const fetchSubjects = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("subjects")
        .select("*")
        .eq("user_id", user.id)
        .order("name");

      setSubjects((data as Subject[]) ?? []);
    };
    fetchSubjects();
  }, []);

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated. Please log in again.");

      const code = generateCode();

      const roomPayload = {
        name: data.name.trim(),
        description: data.description?.trim() || null,
        owner_id: user.id,
        subject_id: data.subject_id || null,
        study_method: data.study_method,
        is_public: data.is_public,
        code,
        study_duration: data.study_method === "target" ? null
          : data.study_method === "custom" ? (data.study_duration ?? 25 * 60)
          : (STUDY_METHODS[data.study_method]?.studyDuration ?? 1500),
        break_duration: data.study_method === "target" ? null
          : data.study_method === "custom" ? (data.break_duration ?? 300)
          : (STUDY_METHODS[data.study_method]?.breakDuration ?? 300),
        cycles: data.study_method === "target" || data.study_method === "stopwatch" ? null
          : data.study_method === "custom" ? (data.cycles ?? 4)
          : (STUDY_METHODS[data.study_method]?.cycles ?? 4),
        target_duration: data.study_method === "target" ? (data.target_duration ?? 3600) : null,
      };

      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .insert(roomPayload)
        .select()
        .single();

      if (roomError) {
        console.error("Room insert error:", JSON.stringify(roomError));
        throw new Error(`Failed to create room: ${roomError.message} (code: ${roomError.code})`);
      }

      const { error: memberError } = await supabase.from("room_members").insert({
        room_id: room.id,
        user_id: user.id,
        status: "idle",
      });

      if (memberError) {
        console.error("Member insert error:", memberError);
      }

      router.push(`/room/${code}`);
    } catch (err) {
      console.error("Room creation failed:", err);
      setError(err instanceof Error ? err.message : "Failed to create room");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/rooms">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create Room</h1>
          <p className="text-sm text-muted-foreground">
            Set up a new study room for you and others
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              Room Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Room Name"
              placeholder="Study Session #1"
              error={errors.name?.message}
              {...register("name")}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">
                Description
              </label>
              <Textarea
                placeholder="What are we studying today?"
                error={errors.description?.message}
                rows={3}
                {...register("description")}
              />
            </div>

            {subjects.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">
                  Subject (optional)
                </label>
                <select
                  className="flex h-10 w-full rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  {...register("subject_id")}
                >
                  <option value="">No subject</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">
                  {isPublic ? "Public Room" : "Private Room"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {isPublic
                    ? "Visible in the room discovery page — anyone can join"
                    : "Hidden from discovery — only people with the invite code can join"}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isPublic}
                onClick={() => setValue("is_public", !isPublic, { shouldValidate: true })}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
                  isPublic ? "bg-primary" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg transition-transform",
                    isPublic ? "translate-x-6" : "translate-x-1",
                  )}
                />
              </button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-secondary" />
              Study Method
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {METHOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setValue("study_method", opt.value, { shouldValidate: true })}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-3 text-left transition-all cursor-pointer",
                    selectedMethod === opt.value
                      ? "border-primary bg-primary/10 ring-1 ring-primary"
                      : "border-border hover:border-border/80 hover:bg-muted/50",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5",
                      selectedMethod === opt.value
                        ? "text-primary"
                        : "text-muted-foreground",
                    )}
                  >
                    {opt.icon}
                  </span>
                  <div>
                    <span className="block text-sm font-medium">{opt.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {opt.description}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {selectedMethod === "custom" && (
              <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
                <h4 className="text-sm font-medium">Custom Settings</h4>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input
                    label="Focus Duration (sec)"
                    type="number"
                    min={60}
                    max={14400}
                    error={errors.study_duration?.message}
                    {...register("study_duration", { valueAsNumber: true })}
                  />
                  <Input
                    label="Break Duration (sec)"
                    type="number"
                    min={30}
                    max={3600}
                    error={errors.break_duration?.message}
                    {...register("break_duration", { valueAsNumber: true })}
                  />
                  <Input
                    label="Cycles"
                    type="number"
                    min={1}
                    max={20}
                    error={errors.cycles?.message}
                    {...register("cycles", { valueAsNumber: true })}
                  />
                </div>
              </div>
            )}

            {selectedMethod === "target" && (
              <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
                <h4 className="text-sm font-medium">Target Settings</h4>
                <Input
                  label="Target Duration (seconds)"
                  type="number"
                  min={60}
                  max={28800}
                  error={errors.target_duration?.message}
                  {...register("target_duration", { valueAsNumber: true })}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Estimated XP per session</p>
                <div className="flex flex-wrap items-center gap-1 sm:gap-3 text-xs text-muted-foreground">
                  <span>{perCycleXp.totalXp} XP per cycle × {cycleCount} cycles</span>
                  <span className="font-semibold text-primary">= {totalXp} XP total</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button
          type="submit"
          size="lg"
          loading={submitting}
          className="w-full gap-2"
        >
          <Users className="h-5 w-5" />
          Create Room
        </Button>
      </form>
    </div>
  );
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
