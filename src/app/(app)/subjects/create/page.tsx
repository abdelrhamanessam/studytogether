"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Palette, Check, Flag, Rocket, Flame } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MISSION_POOLS,
  MISSION_HINTS,
  MISSION_SIZES,
  type MissionSize,
} from "@/lib/xp";

const PRESET_COLORS = [
  "#6c5ce7", "#00cec9", "#fd79a8", "#00b894", "#fdcb6e",
  "#e17055", "#0984e3", "#e84393", "#00b4d8", "#55efc4",
  "#fab1a0", "#a29bfe", "#ff7675", "#74b9ff", "#ffeaa7", "#dfe6e9",
];

const MISSION_OPTIONS: {
  size: MissionSize;
  label: string;
  icon: typeof Flag;
  hint: string;
}[] = [
  { size: "small", label: "Small mission", icon: Flag, hint: MISSION_HINTS.small },
  { size: "medium", label: "Medium mission", icon: Rocket, hint: MISSION_HINTS.medium },
  { size: "large", label: "Large mission", icon: Flame, hint: MISSION_HINTS.large },
];

const schema = z.object({
  name: z.string().min(1, "Subject name is required").max(100, "Name too long"),
  color: z.string().min(1, "Pick a color"),
  lesson_count: z.number().min(1, "At least 1 lesson").max(500, "Max 500 lessons"),
  mission_size: z.enum(MISSION_SIZES),
  duration_type: z.enum(["quick", "semester", "year"]),
});

type FormData = z.infer<typeof schema>;

export default function CreateSubjectPage() {
  const router = useRouter();
  const supabase = createClient();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      color: PRESET_COLORS[0],
      lesson_count: 10,
      mission_size: "medium",
      duration_type: "semester",
    },
  });

  const selectedColor = watch("color");
  const selectedMission = watch("mission_size") as MissionSize;
  const lessonCount = watch("lesson_count");
  const totalXp = MISSION_POOLS[selectedMission] ?? 15000;
  const xpPerLesson = Math.round(totalXp / Math.max(lessonCount, 1));

  const DURATION_BY_MISSION: Record<MissionSize, "quick" | "semester" | "year"> = {
    small: "quick",
    medium: "semester",
    large: "year",
  };

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) { setSubmitting(false); return; }

    const { data: subject, error: subjectError } = await supabase
      .from("subjects")
      .insert({
        user_id: user.id,
        name: data.name,
        color: data.color,
        total_lessons: data.lesson_count,
        total_xp: MISSION_POOLS[data.mission_size],
        duration_type: data.duration_type,
        mission_size: data.mission_size,
      })
      .select()
      .single();

    if (subjectError || !subject) { setSubmitting(false); return; }

    const lessons = Array.from({ length: data.lesson_count }, (_, i) => ({
      subject_id: subject.id,
      user_id: user.id,
      name: `Lesson ${i + 1}`,
      unit_name: "",
      position: i + 1,
      status: "not_started" as const,
    }));

    await supabase.from("lessons").insert(lessons);
    router.push(`/subjects/${subject.id}`);
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="animate-fade-in">
        <button
          onClick={() => router.back()}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <h1 className="text-2xl font-bold tracking-tight">Create Subject</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a new subject to track your study progress
        </p>
      </div>

      <Card className="animate-fade-in" style={{ animationDelay: "80ms" }}>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <Input
              label="Subject Name"
              placeholder="e.g. Mathematics, History, Chemistry..."
              error={errors.name?.message}
              {...register("name")}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">
                <span className="flex items-center gap-1.5">
                  <Palette size={14} />
                  Color
                </span>
              </label>
              <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setValue("color", color)}
                    className={cn(
                      "relative aspect-square w-full cursor-pointer rounded-xl transition-all duration-150 hover:scale-110",
                      selectedColor === color &&
                        "ring-2 ring-foreground ring-offset-2 ring-offset-card scale-110",
                    )}
                    style={{ backgroundColor: color }}
                  >
                    {selectedColor === color && (
                      <Check size={14} className="absolute inset-0 m-auto text-white drop-shadow-md" />
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="color"
                  value={selectedColor}
                  onChange={(e) => setValue("color", e.target.value)}
                  className="h-9 w-9 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                />
                <span className="text-xs text-muted-foreground">or pick a custom color</span>
              </div>
              {errors.color && <p className="text-xs text-danger">{errors.color.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">
                <span className="flex items-center gap-1.5">
                  <Flag size={14} />
                  Mission Size
                </span>
              </label>
              <div className="grid gap-2 sm:grid-cols-3">
                {MISSION_OPTIONS.map((opt) => (
                  <button
                    key={opt.size}
                    type="button"
                    onClick={() => {
                      setValue("mission_size", opt.size, { shouldValidate: true });
                      setValue("duration_type", DURATION_BY_MISSION[opt.size], { shouldValidate: true });
                    }}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border p-3 text-left transition-all cursor-pointer",
                      selectedMission === opt.size
                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                        : "border-border hover:border-border/80 hover:bg-muted/50",
                    )}
                  >
                    <opt.icon
                      className={cn(
                        "h-5 w-5",
                        selectedMission === opt.size ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    <span className="text-sm font-medium">{opt.label}</span>
                    <span className="text-xs text-muted-foreground">{opt.hint}</span>
                  </button>
                ))}
              </div>
              <input type="hidden" {...register("mission_size")} />
              <input type="hidden" {...register("duration_type")} />
            </div>

            <Input
              label="Number of Lessons"
              type="number"
              min={1}
              max={500}
              placeholder="10"
              error={errors.lesson_count?.message}
              {...register("lesson_count", { valueAsNumber: true })}
            />

            <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total XP Pool</span>
                <span className="font-bold text-primary">{totalXp.toLocaleString()} XP</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">XP per Lesson</span>
                <span className="font-semibold">{xpPerLesson} XP</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">XP per Revision</span>
                <span className="font-semibold text-muted-foreground">{Math.round(xpPerLesson / 3)} XP</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" loading={submitting} size="lg">
                Create Subject
              </Button>
              <Button type="button" variant="ghost" size="lg" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
