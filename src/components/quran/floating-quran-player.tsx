"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuran } from "./quran-provider";
import { QURAN_RECITERS, getSurahByGlobalAyah } from "@/lib/quran";
import { cn } from "@/lib/utils";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  X,
  Loader2,
  BookOpenText,
} from "lucide-react";
import { ResumeQuranDialog } from "./resume-quran-dialog";

interface FloatingQuranPlayerProps {
  userId?: string;
  resumeProgress: { reciterId: string; globalAyah: number } | null;
  promptShown: boolean;
  setPromptShown: (v: boolean) => void;
  onResume: (globalAyah: number) => void;
  onRestart: () => void;
}

export function FloatingQuranPlayer({
  userId,
  resumeProgress,
  promptShown,
  setPromptShown,
  onResume,
  onRestart,
}: FloatingQuranPlayerProps) {
  const pathname = usePathname();
    const isQuranPage = pathname === "/quran";
  const {
    current,
    isPlaying,
    isLoading,
    isFloatingOpen,
    isDocked,
    reciterId,
    playPause,
    next,
    prev,
    setFloatingOpen,
    dismissCurrent,
  } = useQuran();

  const [showDialog, setShowDialog] = useState(false);
  const [hasUntouchedProgress, setHasUntouchedProgress] = useState(false);

  // Show resume dialog on the Quran page when there's saved progress and nothing playing yet
  useEffect(() => {
    if (isQuranPage && resumeProgress && !current && !promptShown && !hasUntouchedProgress) {
      setHasUntouchedProgress(true);
      setShowDialog(true);
      setPromptShown(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQuranPage, resumeProgress, current, promptShown]);

  const hasCurrent = !!current;

  // If docked in a room, we show a distinct dock style (bottom above mobile nav)
  const dockedClass = isDocked
    ? "left-1/2 -translate-x-1/2 bottom-24 md:bottom-6 w-[calc(100%-2rem)] max-w-md shadow-2xl"
    : "left-1/2 -translate-x-1/2 bottom-24 md:bottom-6";

  if (!hasCurrent) {
    // Floating round launch button (only when nothing is playing and not on quran page)
    return (
      <>
        {!isQuranPage && (
          <Link
            href="/quran"
            aria-label="القرآن الكريم"
            className="fixed bottom-24 md:bottom-6 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-primary/40 bg-card text-primary shadow-xl transition-all hover:scale-105 active:scale-95"
          >
            <BookOpenText className="h-6 w-6" />
          </Link>
        )}
        <ResumeQuranDialog
          open={showDialog}
          onOpenChange={setShowDialog}
          progress={resumeProgress}
          onResume={onResume}
          onRestart={onRestart}
        />
      </>
    );
  }

  const surahInfo = getSurahByGlobalAyah(current.globalAyah);
  const reciterName = QURAN_RECITERS.find((r) => r.id === reciterId)?.name ?? reciterId;

  return (
    <>
      {/* Player panel */}
      <div
        className={cn(
          "fixed z-50 transition-all duration-500 ease-out",
          isFloatingOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8 pointer-events-none",
          dockedClass,
        )}
      >
        <div className="rounded-2xl border border-border bg-card p-3 shadow-xl">
          <div className="flex items-center gap-3">
            {/* Reciter avatar / icon */}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <BookOpenText className="h-5 w-5 text-primary" />
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                سورة {surahInfo.name.replace(/ُ|َ|ِ|ّ|ْ|ً|ٌ|ٍ/g, "").trim()}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                الآية {current.ayah} · {reciterName}
              </p>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-1">
              <button
                onClick={prev}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                aria-label="السابقة"
              >
                <SkipBack className="h-4 w-4" />
              </button>
              <button
                onClick={playPause}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-md transition-transform active:scale-95"
                aria-label={isPlaying ? "إيقاف" : "تشغيل"}
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5" />
                )}
              </button>
              <button
                onClick={next}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                aria-label="التالية"
              >
                <SkipForward className="h-4 w-4" />
              </button>
              <button
                onClick={dismissCurrent}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <ResumeQuranDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        progress={resumeProgress}
        onResume={onResume}
        onRestart={onRestart}
      />
    </>
  );
}
