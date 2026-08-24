"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  BookOpen,
  Clock,
  ChevronRight,
  Loader2,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDurationShort, cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { Subject } from "@/types";

interface SubjectWithStats extends Subject {
  completed_lessons: number;
  in_progress_lessons: number;
  total_lessons_count: number;
  study_seconds: number;
}

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<SubjectWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    let cancelled = false;
    async function fetchSubjects() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) { setLoading(false); return; }

      const { data: subjectsData } = await supabase
        .from("subjects")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (!subjectsData) {
        setSubjects([]);
        setLoading(false);
        return;
      }

      const enriched = await Promise.all(
        subjectsData.map(async (subject) => {
          const { data: lessons } = await supabase
            .from("lessons")
            .select("status")
            .eq("subject_id", subject.id);

          const lessonList = lessons ?? [];
          const completed_lessons = lessonList.filter(
            (l) => l.status === "completed",
          ).length;
          const in_progress_lessons = lessonList.filter(
            (l) => l.status === "in_progress",
          ).length;

          const { data: sessions } = await supabase
            .from("study_sessions")
            .select("actual_duration")
            .eq("subject_id", subject.id)
            .eq("user_id", user.id);

          const study_seconds = (sessions ?? []).reduce(
            (sum, s) => sum + (s.actual_duration ?? 0),
            0,
          );

          return {
            ...subject,
            completed_lessons,
            in_progress_lessons,
            total_lessons_count: subject.total_lessons,
            study_seconds,
          };
        }),
      );

      if (cancelled) return;
      setSubjects(enriched);
      setLoading(false);
    }
    fetchSubjects();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-in flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Subjects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize your studies and track progress across subjects
          </p>
        </div>
        <Button onClick={() => router.push("/subjects/create")}>
          <Plus size={16} />
          Add Subject
        </Button>
      </div>

      {subjects.length === 0 ? (
        <div className="animate-fade-in flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <BookOpen className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">No subjects yet</h3>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Create your first subject to start tracking progress
          </p>
          <Button
            className="mt-6"
            onClick={() => router.push("/subjects/create")}
          >
            <Plus size={16} />
            Create Subject
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((subject, i) => {
            const progressPct =
              subject.total_lessons_count > 0
                ? Math.round(
                    (subject.completed_lessons /
                      subject.total_lessons_count) *
                      100,
                  )
                : 0;

            return (
              <Link
                key={subject.id}
                href={`/subjects/${subject.id}`}
                className="group"
              >
                <Card
                  glow
                  className={cn(
                    "animate-fade-in h-full transition-all duration-200 hover:border-primary/30",
                    "cursor-pointer",
                  )}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <CardContent className="flex flex-col gap-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-3 w-3 rounded-full border-2 ring-offset-2 ring-offset-card"
                          style={{
                            backgroundColor: subject.color,
                            borderColor: subject.color,
                          }}
                        />
                        <h3 className="font-semibold text-card-foreground group-hover:text-primary transition-colors">
                          {subject.name}
                        </h3>
                      </div>
                      <ChevronRight
                        size={16}
                        className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                      />
                    </div>

                    <ProgressBar
                      value={progressPct}
                      label={`${subject.completed_lessons}/${subject.total_lessons_count} lessons`}
                      showPercentage
                      size="sm"
                    />

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Sparkles size={12} className="text-accent" />
                        <span>
                          {subject.completed_lessons} completed
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock size={12} />
                        <span>
                          {formatDurationShort(subject.study_seconds)}
                        </span>
                      </div>
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
