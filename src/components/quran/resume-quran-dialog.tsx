"use client";

import {
  getSurahByGlobalAyah,
  globalAyahToSurahAyah,
  QURAN_RECITERS,
} from "@/lib/quran";
import {
  BookOpenText,
  RotateCcw,
  ArrowRight,
} from "lucide-react";

interface ResumeQuranDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  progress: { reciterId: string; globalAyah: number } | null;
  onResume: (globalAyah: number) => void;
  onRestart: () => void;
}

export function ResumeQuranDialog({
  open,
  onOpenChange,
  progress,
  onResume,
  onRestart,
}: ResumeQuranDialogProps) {
  if (!open || !progress) return null;

  const { surah, ayah } = globalAyahToSurahAyah(progress.globalAyah);
  const reciter = QURAN_RECITERS.find((r) => r.id === progress.reciterId);
  const surahName = surah.name.replace(/[\u064B-\u0652\u0670]/g, "").trim();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl animate-fade-in">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
          <BookOpenText className="h-6 w-6 text-primary" />
        </div>

        <h2 className="text-lg font-bold">تابع التلاوة؟</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          كنت وصلت لحد ما في آخر جلسة:
        </p>

        <div className="mt-4 rounded-xl bg-muted p-4">
          <p className="text-base font-semibold">{surahName}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            الآية {ayah} · {reciter?.name}
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={() => onResume(progress.globalAyah)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-white transition-all hover:bg-primary-dark active:scale-[0.98]"
          >
            <ArrowRight className="h-4 w-4" />
            كمّل من الآية {ayah}
          </button>
          <button
            onClick={() => {
              onRestart();
              onOpenChange(false);
            }}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            <RotateCcw className="h-4 w-4" />
            ابدأ من الأول
          </button>
          <button
            onClick={() => onOpenChange(false)}
            className="h-9 text-xs text-muted-foreground hover:text-foreground"
          >
            بعدين
          </button>
        </div>
      </div>
    </div>
  );
}
