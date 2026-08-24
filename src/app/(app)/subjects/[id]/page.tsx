"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  Loader2,
  Plus,
  GripVertical,
  CheckCircle2,
  Circle,
  RotateCcw,
  Pencil,
  Trash2,
  Sparkles,
  Hash,
  FileDown,
  X,
  Copy,
  Zap,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDurationShort, cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Input } from "@/components/ui/input";
import { parseSyllabusText, type ParsedUnit } from "@/lib/parse-syllabus";
import { calculateLessonXp } from "@/lib/xp";
import type { Subject, Lesson, LessonPart } from "@/types";

const PROMPT_TEMPLATE = `Generate a study syllabus for [Subject] ([Grade/Level]).

Use this exact format:

# Chapter/Unit Title
- Lesson name 1
  - Sub-task 1
  - Sub-task 2
- Lesson name 2

# Chapter 2: Next Topic
- Lesson name A
- Lesson name B

Rules:
- Lines starting with # are chapter/unit titles.
- Lines starting with "- " are lessons.
- Indented lines starting with "  - " directly under a lesson are that lesson's sub-tasks (optional).

Example:

# Chapter 1: Introduction to Physics
- What is Physics?
- Units and Measurements
  - SI Units
  - Unit Conversions
- Motion in One Dimension
  - Distance vs Displacement
  - Speed and Velocity

# Chapter 2: Forces
- Newton's First Law
- Newton's Second Law
- Newton's Third Law
- Friction`;

export default function SubjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const subjectId = params.id as string;
  const [supabase] = useState(() => createClient());

  const [subject, setSubject] = useState<Subject | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingLessons, setAddingLessons] = useState(false);
  const [addCount, setAddCount] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [partsMap, setPartsMap] = useState<Record<string, LessonPart[]>>({}); // keyed by lesson_id
  const [expandedLessons, setExpandedLessons] = useState<Set<string>>(new Set());
  const [addingPartFor, setAddingPartFor] = useState<string | null>(null);
  const [newPartName, setNewPartName] = useState("");
  const [renamingPartId, setRenamingPartId] = useState<string | null>(null);
  const [renamePartValue, setRenamePartValue] = useState("");

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [parsedUnits, setParsedUnits] = useState<ParsedUnit[]>([]);
  const [importing, setImporting] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  const lessonsRef = useRef<Lesson[]>([]);
  lessonsRef.current = lessons;

  const loadSubject = useCallback(async () => {
    const { data: sub } = await supabase
      .from("subjects")
      .select("*")
      .eq("id", subjectId)
      .single();
    setSubject(sub);

    const { data: les } = await supabase
      .from("lessons")
      .select("*")
      .eq("subject_id", subjectId)
      .order("position", { ascending: true });
    setLessons(les ?? []);

    if (les && les.length > 0) {
      const { data: partsData } = await supabase
        .from("lesson_parts")
        .select("*")
        .in("lesson_id", les.map((l) => l.id))
        .order("position", { ascending: true });

      const map: Record<string, LessonPart[]> = {};
      for (const part of partsData ?? []) {
        if (!map[part.lesson_id]) map[part.lesson_id] = [];
        map[part.lesson_id].push(part);
      }
      setPartsMap(map);

      setExpandedLessons((prev) => {
        const next = new Set(prev);
        for (const lesson of les) {
          const parts = map[lesson.id];
          if (parts && parts.length > 0 && parts.some((p) => !p.is_done)) {
            next.add(lesson.id);
          }
        }
        return next;
      });
    } else {
      setPartsMap({});
    }

    setLoading(false);
  }, [subjectId, supabase]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      await loadSubject();
      if (cancelled) return;
    }
    load();
    return () => { cancelled = true; };
  }, [loadSubject]);

  const completedCount = lessons.filter(
    (l) => l.status === "completed",
  ).length;
  const revisedCount = lessons.filter(
    (l) => l.status === "revised",
  ).length;
  const inProgressCount = lessons.filter(
    (l) => l.status === "in_progress",
  ).length;
  const progressPct =
    lessons.length > 0
      ? Math.round(((completedCount + revisedCount) / lessons.length) * 100)
      : 0;

  const subjectTotalXp = subject?.total_xp ?? 5000;
  const xpPerLesson = lessons.length > 0 ? calculateLessonXp(subjectTotalXp, lessons.length, false) : 0;
  const xpPerRevision = lessons.length > 0 ? calculateLessonXp(subjectTotalXp, lessons.length, true) : 0;

  const groupedByUnit = lessons.reduce<Record<string, Lesson[]>>((acc, lesson) => {
    const unit = lesson.unit_name || "";
    if (!acc[unit]) acc[unit] = [];
    acc[unit].push(lesson);
    return acc;
  }, {});

  const unitOrder = Object.keys(groupedByUnit);

  function toggleExpanded(lessonId: string) {
    setExpandedLessons((prev) => {
      const next = new Set(prev);
      if (next.has(lessonId)) {
        next.delete(lessonId);
      } else {
        next.add(lessonId);
      }
      return next;
    });
  }

  async function cycleStatus(lesson: Lesson) {
    const nextStatus =
      lesson.status === "not_started"
        ? "in_progress"
        : lesson.status === "in_progress"
          ? "completed"
          : lesson.status === "revised"
            ? "completed"
            : "not_started";

    const updates: Record<string, unknown> = { status: nextStatus };
    if (nextStatus === "completed") {
      updates.completed_at = new Date().toISOString();
    } else {
      updates.completed_at = null;
    }

    const { error } = await supabase.from("lessons").update(updates).eq("id", lesson.id);
    if (error) return;

    if (nextStatus === "completed" && subject) {
      await supabase.rpc("award_lesson_xp", {
        p_user_id: lessons[0]?.user_id ?? "",
        p_lesson_id: lesson.id,
        p_is_revision: false,
      });
    }

    setLessons((prev) => {
      const next = prev.map((l) => (l.id === lesson.id ? { ...l, ...updates } : l));
      return next;
    });
  }

  async function reviseLesson(lesson: Lesson) {
    const { error } = await supabase
      .from("lessons")
      .update({ status: "revised", completed_at: new Date().toISOString() })
      .eq("id", lesson.id);
    if (error) return;

    if (subject) {
      await supabase.rpc("award_lesson_xp", {
        p_user_id: lesson.user_id,
        p_lesson_id: lesson.id,
        p_is_revision: true,
      });
    }

    setLessons((prev) =>
      prev.map((l) =>
        l.id === lesson.id ? { ...l, status: "revised" as const, revision_count: (l.revision_count ?? 0) + 1 } : l,
      ),
    );
  }

  async function addPart(lessonId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const existing = partsMap[lessonId] ?? [];
    const nextPosition =
      existing.length > 0 ? Math.max(...existing.map((p) => p.position)) + 1 : 1;

    const { data: inserted, error } = await supabase
      .from("lesson_parts")
      .insert({
        lesson_id: lessonId,
        user_id: user.id,
        name: trimmed,
        position: nextPosition,
        is_done: false,
      })
      .select()
      .single();
    if (error || !inserted) return;

    setPartsMap((prev) => ({
      ...prev,
      [lessonId]: [...(prev[lessonId] ?? []), inserted],
    }));
  }

  async function togglePart(part: LessonPart) {
    const nextDone = !part.is_done;

    const { error } = await supabase
      .from("lesson_parts")
      .update({ is_done: nextDone })
      .eq("id", part.id);
    if (error) return;

    const updatedList = (partsMap[part.lesson_id] ?? []).map((p) =>
      p.id === part.id ? { ...p, is_done: nextDone } : p,
    );

    setPartsMap((prev) => ({
      ...prev,
      [part.lesson_id]: updatedList,
    }));

    const lesson = lessonsRef.current.find((l) => l.id === part.lesson_id);
    if (
      lesson &&
      updatedList.length > 0 &&
      updatedList.every((p) => p.is_done) &&
      lesson.status !== "completed" &&
      lesson.status !== "revised"
    ) {
      setLessons((prev) =>
        prev.map((l) =>
          l.id === lesson.id
            ? { ...l, status: "completed" as const, completed_at: new Date().toISOString() }
            : l,
        ),
      );
    }
  }

  async function deletePart(partId: string, lessonId: string) {
    const { error } = await supabase.from("lesson_parts").delete().eq("id", partId);
    if (error) return;

    setPartsMap((prev) => ({
      ...prev,
      [lessonId]: (prev[lessonId] ?? []).filter((p) => p.id !== partId),
    }));
  }

  async function renamePart(partId: string, lessonId: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed) {
      setRenamingPartId(null);
      return;
    }

    const { error } = await supabase
      .from("lesson_parts")
      .update({ name: trimmed })
      .eq("id", partId);

    if (!error) {
      setPartsMap((prev) => ({
        ...prev,
        [lessonId]: (prev[lessonId] ?? []).map((p) =>
          p.id === partId ? { ...p, name: trimmed } : p,
        ),
      }));
    }
    setRenamingPartId(null);
  }

  async function addLessons() {
    if (addCount < 1) return;
    setAddingLessons(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) { setAddingLessons(false); return; }

    const currentLessons = lessonsRef.current;
    const startPos =
      currentLessons.length > 0
        ? Math.max(...currentLessons.map((l) => l.position)) + 1
        : 1;

    const newLessons = Array.from({ length: addCount }, (_, i) => ({
      subject_id: subjectId,
      user_id: user.id,
      name: `Lesson ${startPos + i}`,
      unit_name: "",
      position: startPos + i,
      status: "not_started" as const,
    }));

    const { error } = await supabase.from("lessons").insert(newLessons);
    if (error) { setAddingLessons(false); return; }

    const newTotal = currentLessons.length + addCount;
    await supabase
      .from("subjects")
      .update({ total_lessons: newTotal })
      .eq("id", subjectId);

    setAddCount(1);
    await loadSubject();
    setAddingLessons(false);
  }

  async function importFromText() {
    if (parsedUnits.length === 0) return;
    setImporting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) { setImporting(false); return; }

    const currentLessons = lessonsRef.current;
    let startPos =
      currentLessons.length > 0
        ? Math.max(...currentLessons.map((l) => l.position)) + 1
        : 1;

    const allNew: {
      lesson: {
        subject_id: string;
        user_id: string;
        name: string;
        unit_name: string;
        position: number;
        status: "not_started";
      };
      parts: string[];
    }[] = [];

    for (const unit of parsedUnits) {
      unit.lessons.forEach((lessonName, lessonIdx) => {
        allNew.push({
          lesson: {
            subject_id: subjectId,
            user_id: user.id,
            name: lessonName,
            unit_name: unit.name,
            position: startPos,
            status: "not_started",
          },
          parts: unit.parts[lessonIdx] ?? [],
        });
        startPos++;
      });
    }

    const BATCH_SIZE = 50;
    const PART_BATCH_SIZE = 100;
    for (let i = 0; i < allNew.length; i += BATCH_SIZE) {
      const batch = allNew.slice(i, i + BATCH_SIZE);
      const { data: insertedLessons, error } = await supabase
        .from("lessons")
        .insert(batch.map((entry) => entry.lesson))
        .select("id");

      if (error) {
        console.error("Import batch error:", error);
        continue;
      }

      const partsToInsert: {
        lesson_id: string;
        user_id: string;
        name: string;
        position: number;
        is_done: boolean;
      }[] = [];

      (insertedLessons ?? []).forEach((row, idx) => {
        const entry = batch[idx];
        if (!entry) return;
        entry.parts.forEach((partName, partIdx) => {
          partsToInsert.push({
            lesson_id: row.id,
            user_id: user.id,
            name: partName,
            position: partIdx + 1,
            is_done: false,
          });
        });
      });

      for (let j = 0; j < partsToInsert.length; j += PART_BATCH_SIZE) {
        const { error: partsError } = await supabase
          .from("lesson_parts")
          .insert(partsToInsert.slice(j, j + PART_BATCH_SIZE));
        if (partsError) {
          console.error("Import parts batch error:", partsError);
        }
      }
    }

    await supabase
      .from("subjects")
      .update({ total_lessons: currentLessons.length + allNew.length })
      .eq("id", subjectId);

    setImportOpen(false);
    setImportText("");
    setParsedUnits([]);
    await loadSubject();
    setImporting(false);
  }

  function handleImportTextChange(text: string) {
    setImportText(text);
    if (text.trim()) {
      setParsedUnits(parseSyllabusText(text));
    } else {
      setParsedUnits([]);
    }
  }

  async function renameLesson(lessonId: string) {
    if (!editName.trim()) return;
    const { error } = await supabase
      .from("lessons")
      .update({ name: editName.trim() })
      .eq("id", lessonId);
    if (!error) {
      setLessons((prev) =>
        prev.map((l) =>
          l.id === lessonId ? { ...l, name: editName.trim() } : l,
        ),
      );
    }
    setEditingId(null);
  }

  async function deleteLesson(lessonId: string) {
    setDeletingId(lessonId);
    const { error } = await supabase.from("lessons").delete().eq("id", lessonId);

    if (!error) {
      setLessons((prev) => {
        const next = prev.filter((l) => l.id !== lessonId);
        supabase.from("subjects").update({ total_lessons: next.length }).eq("id", subjectId);
        return next;
      });
      setPartsMap((prev) => {
        const next = { ...prev };
        delete next[lessonId];
        return next;
      });
      setExpandedLessons((prev) => {
        const next = new Set(prev);
        next.delete(lessonId);
        return next;
      });
    }
    setDeletingId(null);
  }

  async function deleteSubject() {
    if (!confirm("Delete this subject and all its lessons?")) return;
    await supabase.from("lessons").delete().eq("subject_id", subjectId);
    await supabase.from("subjects").delete().eq("id", subjectId);
    router.push("/subjects");
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-muted-foreground">Subject not found</p>
        <Button className="mt-4" onClick={() => router.push("/subjects")}>
          Back to Subjects
        </Button>
      </div>
    );
  }

  const totalImportLessons = parsedUnits.reduce((sum, u) => sum + u.lessons.length, 0);
  const totalImportParts = parsedUnits.reduce(
    (sum, u) => sum + u.parts.reduce((s, p) => s + (p?.length ?? 0), 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="animate-fade-in">
        <button
          onClick={() => router.push("/subjects")}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
        >
          <ArrowLeft size={14} />
          Subjects
        </button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div
              className="h-4 w-4 rounded-full"
              style={{ backgroundColor: subject.color }}
            />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {subject.name}
              </h1>
              <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Sparkles size={13} className="text-accent" />
                  {completedCount}/{lessons.length} completed
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock size={13} />
                  {formatDurationShort(
                    lessons.length * 900,
                  )}
                </span>
              </div>
            </div>
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={deleteSubject}
          >
            <Trash2 size={14} />
            Delete
          </Button>
        </div>
      </div>

      <Card className="animate-fade-in" style={{ animationDelay: "60ms" }}>
        <CardContent>
          <ProgressBar
            value={progressPct}
            label="Overall Progress"
            showPercentage
            size="lg"
            xpBar
          />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 text-center">
            <div className="rounded-xl bg-muted p-3">
              <p className="text-2xl font-bold text-success">
                {completedCount}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Completed
              </p>
            </div>
            <div className="rounded-xl bg-muted p-3">
              <p className="text-2xl font-bold text-primary">
                {revisedCount}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Revised
              </p>
            </div>
            <div className="rounded-xl bg-muted p-3">
              <p className="text-2xl font-bold text-warning">
                {inProgressCount}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                In Progress
              </p>
            </div>
            <div className="rounded-xl bg-primary/10 p-3">
              <p className="text-2xl font-bold text-primary flex items-center justify-center gap-1">
                <Zap size={16} />
                {xpPerLesson}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                XP / Lesson
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 animate-fade-in" style={{ animationDelay: "100ms" }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus size={16} />
              Add Lessons
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Input
                  label="Number of lessons"
                  type="number"
                  min={1}
                  max={100}
                  value={addCount}
                  onChange={(e) =>
                    setAddCount(Math.max(1, parseInt(e.target.value) || 1))
                  }
                />
              </div>
              <Button
                onClick={addLessons}
                loading={addingLessons}
                className="mb-0.5"
              >
                <Plus size={14} />
                Add
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileDown size={16} />
              Import from Text
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Paste a syllabus from ChatGPT or any text with units, lessons and optional sub-tasks.
            </p>
            <Button onClick={() => setImportOpen(true)} className="w-full gap-2">
              <FileDown size={14} />
              Open Import
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="animate-fade-in" style={{ animationDelay: "180ms" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hash size={16} />
            Lessons ({lessons.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lessons.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No lessons yet. Add some manually or import from text.
            </p>
          ) : (
            <div className="space-y-4">
              {unitOrder.map((unitName) => {
                const unitLessons = groupedByUnit[unitName];
                return (
                  <div key={unitName || "__none"}>
                    {unitName && (
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2">
                          {unitName}
                        </span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}
                      <div className="space-y-1">
                      {unitLessons.map((lesson) => {
                        const lessonParts = partsMap[lesson.id] ?? [];
                        const doneParts = lessonParts.filter((p) => p.is_done).length;
                        const allPartsDone =
                          lessonParts.length > 0 && doneParts === lessonParts.length;
                        const isExpanded = expandedLessons.has(lesson.id);
                        const partsPct =
                          lessonParts.length > 0
                            ? Math.round((doneParts / lessonParts.length) * 100)
                            : 0;

                        return (
                          <div key={lesson.id}>
                            <div
                              className={cn(
                                "group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted",
                                lesson.status === "completed" && "bg-success/5",
                                lesson.status === "revised" && "bg-primary/5",
                              )}
                            >
                              <button
                                onClick={() => toggleExpanded(lesson.id)}
                                className="shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                                title={isExpanded ? "Collapse parts" : "Expand parts"}
                              >
                                {isExpanded ? (
                                  <ChevronDown size={14} />
                                ) : (
                                  <ChevronRight size={14} />
                                )}
                              </button>

                              <GripVertical
                                size={14}
                                className="shrink-0 text-muted-foreground/40"
                              />

                              <button
                                onClick={() => cycleStatus(lesson)}
                                className="shrink-0 cursor-pointer"
                                title={`Status: ${lesson.status.replace("_", " ")}. Click to cycle.`}
                              >
                                {lesson.status === "completed" ? (
                                  <CheckCircle2 size={20} className="text-success" />
                                ) : lesson.status === "revised" ? (
                                  <RefreshCw size={20} className="text-primary" />
                                ) : lesson.status === "in_progress" ? (
                                  <RotateCcw size={20} className="text-warning" />
                                ) : (
                                  <Circle size={20} className="text-muted-foreground" />
                                )}
                              </button>

                              <span className="hidden sm:inline text-xs tabular-nums text-muted-foreground">
                                {lesson.position}
                              </span>

                              {editingId === lesson.id ? (
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    renameLesson(lesson.id);
                                  }}
                                  className="flex flex-1 items-center gap-2"
                                >
                                  <input
                                    autoFocus
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    onBlur={() => renameLesson(lesson.id)}
                                    className="flex-1 rounded-lg border border-border bg-muted px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                  />
                                </form>
                              ) : (
                                <span
                                  className={cn(
                                    "flex-1 text-sm",
                                    (lesson.status === "completed" || lesson.status === "revised")
                                      ? "text-muted-foreground line-through"
                                      : "text-foreground",
                                  )}
                                >
                                  {lesson.name}
                                </span>
                              )}

                              {lessonParts.length > 0 && (
                                <Badge
                                  variant={allPartsDone ? "success" : "muted"}
                                  size="sm"
                                  className="shrink-0 tabular-nums"
                                >
                                  {doneParts}/{lessonParts.length}
                                </Badge>
                              )}

                              <Badge
                                variant={
                                  lesson.status === "completed"
                                    ? "success"
                                    : lesson.status === "revised"
                                      ? "default"
                                      : lesson.status === "in_progress"
                                        ? "warning"
                                        : "muted"
                                }
                                size="sm"
                                className="hidden sm:inline-flex"
                              >
                                {lesson.status === "not_started"
                                  ? "Not Started"
                                  : lesson.status === "in_progress"
                                    ? "In Progress"
                                    : lesson.status === "revised"
                                      ? `Revised ${lesson.revision_count > 0 ? `×${lesson.revision_count}` : ""}`
                                      : lesson.revision_count > 0
                                        ? `Done ×${lesson.revision_count}r`
                                        : "Done"}
                              </Badge>

                              <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => {
                                    setAddingPartFor(addingPartFor === lesson.id ? null : lesson.id);
                                    setNewPartName("");
                                    if (!isExpanded) toggleExpanded(lesson.id);
                                  }}
                                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-success/10 hover:text-success cursor-pointer"
                                  title="Add part"
                                >
                                  <Plus size={13} />
                                </button>
                                <button
                                  onClick={() => reviseLesson(lesson)}
                                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary cursor-pointer"
                                  title="Mark as revised (earn less XP)"
                                >
                                  <RefreshCw size={13} />
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingId(lesson.id);
                                    setEditName(lesson.name);
                                  }}
                                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  onClick={() => deleteLesson(lesson.id)}
                                  disabled={deletingId === lesson.id}
                                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger cursor-pointer disabled:opacity-50"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="ml-8 sm:ml-12 mr-3 mb-1 space-y-0.5 border-l-2 border-border/70 pl-3">
                                {lessonParts.map((part) => (
                                  <div
                                    key={part.id}
                                    className="group/part flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-muted"
                                  >
                                    <button
                                      onClick={() => togglePart(part)}
                                      className="shrink-0 cursor-pointer"
                                      title={part.is_done ? "Mark as not done" : "Mark as done"}
                                    >
                                      {part.is_done ? (
                                        <CheckSquare size={15} className="text-success" />
                                      ) : (
                                        <Square size={15} className="text-muted-foreground" />
                                      )}
                                    </button>

                                    {renamingPartId === part.id ? (
                                      <form
                                        onSubmit={(e) => {
                                          e.preventDefault();
                                          renamePart(part.id, lesson.id, renamePartValue);
                                        }}
                                        className="flex flex-1 items-center"
                                      >
                                        <input
                                          autoFocus
                                          value={renamePartValue}
                                          onChange={(e) => setRenamePartValue(e.target.value)}
                                          onBlur={() => renamePart(part.id, lesson.id, renamePartValue)}
                                          className="w-full rounded-lg border border-border bg-muted px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                        />
                                      </form>
                                    ) : (
                                      <span
                                        onDoubleClick={() => {
                                          setRenamingPartId(part.id);
                                          setRenamePartValue(part.name);
                                        }}
                                        className={cn(
                                          "flex-1 cursor-default text-xs",
                                          part.is_done
                                            ? "text-muted-foreground line-through"
                                            : "text-foreground",
                                        )}
                                        title="Double-click to rename"
                                      >
                                        {part.name}
                                      </span>
                                    )}

                                    <button
                                      onClick={() => deletePart(part.id, lesson.id)}
                                      className="shrink-0 rounded-lg p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger cursor-pointer group-hover/part:opacity-100"
                                      title="Delete part"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </div>
                                ))}

                                {lessonParts.length > 0 && (
                                  <div className="flex items-center gap-2 px-2 py-1.5">
                                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                      <div
                                        className={cn(
                                          "h-full rounded-full transition-all duration-300",
                                          allPartsDone ? "bg-success" : "bg-primary",
                                        )}
                                        style={{ width: `${partsPct}%` }}
                                      />
                                    </div>
                                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                      {doneParts}/{lessonParts.length} parts done
                                    </span>
                                  </div>
                                )}

                                {addingPartFor === lesson.id ? (
                                  <form
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      addPart(lesson.id, newPartName);
                                      setNewPartName("");
                                      setAddingPartFor(null);
                                    }}
                                    className="flex items-center gap-2 px-2 py-1"
                                  >
                                    <Plus size={13} className="shrink-0 text-muted-foreground" />
                                    <input
                                      autoFocus
                                      value={newPartName}
                                      onChange={(e) => setNewPartName(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Escape") {
                                          setAddingPartFor(null);
                                          setNewPartName("");
                                        }
                                      }}
                                      placeholder="New part name..."
                                      className="w-full flex-1 rounded-lg border border-border bg-muted px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                    <button
                                      type="submit"
                                      className="shrink-0 rounded-lg p-1 text-success hover:bg-success/10 cursor-pointer"
                                      title="Save part"
                                    >
                                      <CheckSquare size={13} />
                                    </button>
                                  </form>
                                ) : null}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-bold">Import Syllabus</h2>
              <button
                onClick={() => {
                  setImportOpen(false);
                  setImportText("");
                  setParsedUnits([]);
                }}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    ChatGPT Prompt — Copy & Paste
                  </p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(PROMPT_TEMPLATE);
                    }}
                    className="flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20 cursor-pointer"
                  >
                    <Copy size={12} />
                    Copy
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Replace <span className="text-foreground font-medium">[Subject]</span> and <span className="text-foreground font-medium">[Grade/Level]</span>, then paste the output below. Indented sub-items become lesson parts.
                </p>
                <button
                  onClick={() => setShowPrompt(!showPrompt)}
                  className="mt-2 text-xs text-primary hover:underline cursor-pointer"
                >
                  {showPrompt ? "Hide prompt" : "Show prompt"}
                </button>
                {showPrompt && (
                  <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-background p-2 text-xs text-muted-foreground border border-border max-h-48 overflow-y-auto">
                    {PROMPT_TEMPLATE}
                  </pre>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Paste your syllabus text
                </label>
                <textarea
                  value={importText}
                  onChange={(e) => handleImportTextChange(e.target.value)}
                  placeholder={`# Chapter 1: Introduction\n- Lesson 1\n  - Sub-task A\n  - Sub-task B\n- Lesson 2\n\n# Chapter 2: Basics\n- Lesson 3\n- Lesson 4`}
                  className="w-full h-48 rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none font-mono"
                />
              </div>

              {parsedUnits.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">
                      Preview
                    </p>
                    <div className="flex items-center gap-2">
                      {totalImportParts > 0 && (
                        <Badge variant="muted" size="sm">
                          {totalImportParts} sub-tasks
                        </Badge>
                      )}
                      <Badge variant="success" size="sm">
                        {totalImportLessons} lessons in {parsedUnits.length} units
                      </Badge>
                    </div>
                  </div>

                  <div className="max-h-64 overflow-y-auto rounded-xl border border-border bg-muted/30 p-3 space-y-3">
                    {parsedUnits.map((unit, i) => (
                      <div key={i}>
                        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <span className="text-primary">#</span>
                          {unit.name}
                        </p>
                        <div className="ml-6 mt-1 space-y-0.5">
                          {unit.lessons.map((lesson, j) => (
                            <div key={j}>
                              <p className="text-xs text-muted-foreground flex items-center gap-2">
                                <span className="text-success/60">-</span>
                                {lesson}
                              </p>
                              {(unit.parts[j] ?? []).length > 0 && (
                                <div className="ml-5 mt-0.5 space-y-0.5 border-l border-border pl-3">
                                  {unit.parts[j].map((part, k) => (
                                    <p key={k} className="text-[11px] text-muted-foreground/70 flex items-center gap-2">
                                      <span className="text-primary/50">·</span>
                                      {part}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={importFromText}
                    loading={importing}
                    className="w-full gap-2"
                  >
                    <FileDown size={14} />
                    Import {totalImportLessons} Lessons
                  </Button>
                </div>
              )}

              {importText.trim() && parsedUnits.length === 0 && (
                <p className="text-sm text-warning text-center py-4">
                  No lessons found. Use # for unit titles and - for lesson names.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
