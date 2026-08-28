"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  QURAN_RECITERS,
  SURAHS,
  surahShortName,
  globalAyahToSurahAyah,
} from "@/lib/quran";
import { useQuran } from "@/components/quran/quran-provider";
import { cn } from "@/lib/utils";
import { Play, Pause, Loader2, AudioLines } from "lucide-react";

export default function QuranPage() {
  const {
    reciterId,
    setReciter,
    current,
    isPlaying,
    isLoading,
    playSurah,
    playPause,
  } = useQuran();

  const [query, setQuery] = useState("");

  const currentSurah = current?.surah ?? null;
  const currentAyah = current?.ayah ?? null;
  const currentReciter = current?.reciterId ?? reciterId;

  // when page loads and nothing is playing, default to a sensible selection (nothing auto-plays)
  useEffect(() => {
    // no-op; rely on resume dialog from provider
  }, []);

  const filtered = SURAHS.filter((s) => {
    if (!query.trim()) return true;
    return s.name.includes(query.trim()) || s.en.toLowerCase().includes(query.toLowerCase());
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-fade-in flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">القرآن الكريم</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            اسمع القرآن في الخلفية وأنت بتذاكر
          </p>
        </div>
      </div>

      {/* Reciters */}
      <div className="animate-fade-in">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">القارئ</h2>
        <div className="flex flex-wrap gap-2">
          {QURAN_RECITERS.map((r) => {
            const active = reciterId === r.id;
            return (
              <button
                key={r.id}
                onClick={() => setReciter(r.id)}
                className={cn(
                  "rounded-xl border px-4 py-2 text-sm font-medium transition-colors cursor-pointer",
                  active
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {r.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Now playing bar */}
      {current && (
        <div className="animate-fade-in flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <AudioLines className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">سورة {surahShortName(currentSurah!)}</p>
            <p className="text-xs text-muted-foreground">
              الآية {currentAyah} ·{" "}
              {QURAN_RECITERS.find((r) => r.id === currentReciter)?.name ?? currentReciter}
              {isLoading && " · جاري التحميل..."}
            </p>
          </div>
          <button
            onClick={playPause}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-md active:scale-95"
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
        </div>
      )}

      {/* Search */}
      <div className="animate-fade-in">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث عن سورة..."
          className="h-11 w-full rounded-xl border border-border bg-card px-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
        />
      </div>

      {/* Surah grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((s, i) => {
          const active = currentSurah === s.n;
          return (
            <button
              key={s.n}
              onClick={() => {
                if (active && current) {
                  // replay current surah from start
                  playSurah(s.n);
                } else {
                  playSurah(s.n);
                }
              }}
              className={cn(
                "animate-fade-in group flex flex-col items-center justify-center gap-1 rounded-2xl border p-4 text-center transition-all hover:border-primary/50 hover:bg-primary/5",
                active ? "border-primary bg-primary/10" : "border-border bg-card",
              )}
              style={{ animationDelay: `${Math.min(i * 15, 400)}ms` }}
            >
              <span className="text-xs text-muted-foreground">{s.n}</span>
              <span className="text-sm font-semibold leading-tight">
                {surahShortName(s.n)}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {s.ayahs} آية
              </span>
              {active && isPlaying && <Play className="mt-1 h-4 w-4 text-primary" />}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          مفيش سورة بالاسم ده
        </p>
      )}

      <p className="text-center text-xs text-muted-foreground">
        القرآن يعمل في الخلفية أثناء المذاكرة في أي روم. المصدر: شبكة القرآن الإسلامية.
      </p>
    </div>
  );
}
