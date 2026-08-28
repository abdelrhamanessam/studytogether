"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  QURAN_RECITERS,
  DEFAULT_RECITER,
  getSurah,
  surahFirstGlobalAyah,
  surahAyahToGlobal,
  globalAyahToSurahAyah,
  ayahAudioUrl,
  type QuranReciter,
} from "@/lib/quran";
import {
  loadQuranProgress,
  saveQuranProgress,
  clearQuranProgress,
} from "@/lib/quran-storage";
import { FloatingQuranPlayer } from "./floating-quran-player";

export interface QuranTrack {
  reciterId: string;
  globalAyah: number;
  surah: number;
  ayah: number;
}

interface QuranContextValue {
  reciterId: string;
  reciters: QuranReciter[];
  current: QuranTrack | null;
  isPlaying: boolean;
  isLoading: boolean;
  isFloatingOpen: boolean;
  isDocked: boolean;
  setReciter: (id: string) => void;
  playSurah: (surah: number, ayah?: number) => void;
  playGlobal: (globalAyah: number) => void;
  toggle: () => void;
  playPause: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  setFloatingOpen: (open: boolean) => void;
  dismissCurrent: () => void;
}

const QuranContext = createContext<QuranContextValue | null>(null);

export function useQuran() {
  const ctx = useContext(QuranContext);
  if (!ctx) throw new Error("useQuran must be used within QuranProvider");
  return ctx;
}

export function QuranProvider({ children, userId }: { children: ReactNode; userId?: string }) {
  const pathname = usePathname();
  const isDocked = pathname?.startsWith("/rooms/") ?? false;

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [reciterId, setReciterId] = useState<string>(DEFAULT_RECITER);
  const [current, setCurrent] = useState<QuranTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFloatingOpen, setFloatingOpen] = useState(false);
  const [resumeProgress, setResumeProgress] = useState<{
    reciterId: string;
    globalAyah: number;
  } | null>(null);
  const [promptShown, setPromptShown] = useState(false);

  // Load saved progress so the resume prompt can be shown
  useEffect(() => {
    if (!userId) return;
    const p = loadQuranProgress(userId);
    if (p && p.globalAyah > 0) {
      setResumeProgress({ reciterId: p.reciterId, globalAyah: p.globalAyah });
      setReciterId(p.reciterId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const a = new Audio();
      a.preload = "auto";
      a.addEventListener("ended", () => {
        setIsPlaying(false);
        // auto-advance only if still playing contextually
        setCurrent((c) => {
          if (!c) return c;
          handleAutoAdvanceRef.current?.(c);
          return c;
        });
      });
      a.addEventListener("play", () => setIsPlaying(true));
      a.addEventListener("pause", () => setIsPlaying(false));
      a.addEventListener("waiting", () => setIsLoading(true));
      a.addEventListener("canplay", () => setIsLoading(false));
      a.addEventListener("playing", () => setIsLoading(false));
      a.addEventListener("error", () => {
        setIsLoading(false);
        setIsPlaying(false);
      });
      audioRef.current = a;
    }
    return audioRef.current;
  }, []);

  // Allow the ended handler to reach the latest autoAdvance
  const handleAutoAdvanceRef = useRef<((t: QuranTrack) => void) | null>(null);

  const persistProgress = useCallback(
    (track: QuranTrack) => {
      if (!userId) return;
      saveQuranProgress({
        userId,
        reciterId: track.reciterId,
        globalAyah: track.globalAyah,
      });
    },
    [userId],
  );

  const playGlobal = useCallback(
    (globalAyah: number, auto?: boolean) => {
      const audio = ensureAudio();
      const { surah, ayah } = globalAyahToSurahAyah(globalAyah);
      const track: QuranTrack = {
        reciterId,
        globalAyah,
        surah: surah.n,
        ayah,
      };
      setCurrent(track);
      persistProgress(track);
      setResumeProgress({ reciterId, globalAyah });
      setIsLoading(true);
      audio.src = ayahAudioUrl(reciterId, globalAyah);
      audio.play().catch(() => setIsLoading(false));
      if (auto !== false) {
        setFloatingOpen(true);
      }
    },
    [reciterId, ensureAudio, persistProgress],
  );

  // Configure the auto-advance behavior (called on end)
  handleAutoAdvanceRef.current = (track) => {
    const surah = getSurah(track.surah);
    const globalNext = track.globalAyah + 1;
    const isLastOfSurah = track.ayah >= surah.ayahs;
    if (isLastOfSurah) {
      // move to next surah first ayah
      if (surah.n < 114) {
        const nextGlobal = surahFirstGlobalAyah(surah.n + 1);
        playGlobalRef.current?.(nextGlobal, false);
      } else {
        // finished the whole Quran
        if (userId) clearQuranProgress(userId);
      }
    } else {
      playGlobalRef.current?.(globalNext, false);
    }
  };

  const playGlobalRef = useRef<((g: number, auto?: boolean) => void) | null>(null);
  playGlobalRef.current = playGlobal;

  const playSurah = useCallback(
    (surah: number, ayah?: number) => {
      const first = surahFirstGlobalAyah(surah) + ((ayah ?? 1) - 1);
      setFloatingOpen(true);
      playGlobal(first);
    },
    [playGlobal],
  );

  const toggle = useCallback(() => {
    if (!current) return;
    const audio = ensureAudio();
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [current, ensureAudio]);

  const playPause = toggle;

  const pause = useCallback(() => {
    ensureAudio().pause();
  }, [ensureAudio]);

  const next = useCallback(() => {
    if (!current) return;
    const g = Math.min(current.globalAyah + 1, 6236);
    playGlobal(g, false);
  }, [current, playGlobal]);

  const prev = useCallback(() => {
    if (!current) return;
    const g = Math.max(current.globalAyah - 1, 1);
    playGlobal(g, false);
  }, [current, playGlobal]);

  const setReciter = useCallback(
    (id: string) => {
      setReciterId(id);
      if (current) {
        // reload current ayah with new reciter
        playGlobal(current.globalAyah, false);
      }
    },
    [current, playGlobal],
  );

  // Save progress when leaving / on unload
  useEffect(() => {
    if (!userId) return;
    const onUnload = () => {
      if (current) {
        saveQuranProgress({ userId, reciterId: current.reciterId, globalAyah: current.globalAyah });
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [userId, current, reciterId]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  const dismissCurrent = useCallback(() => {
    pause();
    setCurrent(null);
  }, [pause]);

  const value: QuranContextValue = {
    reciterId,
    reciters: QURAN_RECITERS,
    current,
    isPlaying,
    isLoading,
    isFloatingOpen,
    isDocked,
    setReciter,
    playSurah,
    playGlobal,
    toggle,
    playPause,
    pause,
    next,
    prev,
    setFloatingOpen,
    dismissCurrent,
  };

  return (
    <QuranContext.Provider value={value}>
      {children}
      <FloatingQuranPlayer
        userId={userId}
        resumeProgress={resumeProgress}
        promptShown={promptShown}
        setPromptShown={setPromptShown}
        onResume={(globalAyah) => {
          playGlobal(globalAyah, false);
          setFloatingOpen(true);
        }}
        onRestart={() => {
          if (userId) clearQuranProgress(userId);
          setResumeProgress(null);
          setPromptShown(true);
        }}
      />
    </QuranContext.Provider>
  );
}

// Re-export helper for surah-ayah conversion used elsewhere
export { surahAyahToGlobal };
