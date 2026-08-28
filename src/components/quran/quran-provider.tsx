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
  DEFAULT_QUALITY,
  getSurah,
  surahFirstGlobalAyah,
  surahAyahToGlobal,
  globalAyahToSurahAyah,
  ayahAudioUrl,
  type QuranReciter,
  type QuranQuality,
} from "@/lib/quran";
import {
  loadQuranProgress,
  saveQuranProgress,
  clearQuranProgress,
  loadQuranQuality,
  saveQuranQuality,
} from "@/lib/quran-storage";
import { FloatingQuranPlayer } from "./floating-quran-player";

export interface QuranTrack {
  reciterId: string;
  globalAyah: number;
  surah: number;
  ayah: number;
  quality: QuranQuality;
}

interface QuranContextValue {
  reciterId: string;
  quality: QuranQuality;
  reciters: QuranReciter[];
  current: QuranTrack | null;
  isPlaying: boolean;
  isLoading: boolean;
  isFloatingOpen: boolean;
  isDocked: boolean;
  setReciter: (id: string) => void;
  setQuality: (q: QuranQuality) => void;
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

  // Retry/failover state for a failing ayah.
  // Holds the globalAyah currently being loaded, how many retries remain,
  // and whether we've decided to skip ahead.
  const loadRef = useRef<{
    globalAyah: number | null;
    retriesLeft: number;
    timeout: ReturnType<typeof setTimeout> | null;
  }>({ globalAyah: null, retriesLeft: 0, timeout: null });

  const MAX_RETRIES = 2;
  const LOAD_TIMEOUT_MS = 15000;

  const [reciterId, setReciterId] = useState<string>(DEFAULT_RECITER);
  const [quality, setQualityState] = useState<QuranQuality>(DEFAULT_QUALITY);
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

  // Load saved quality preference
  useEffect(() => {
    const q = loadQuranQuality();
    if (q) setQualityState(q);
  }, []);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const a = new Audio();
      a.preload = "auto";
      a.addEventListener("ended", () => {
        setIsPlaying(false);
        clearLoadRef();
        // auto-advance only if still playing contextually
        setCurrent((c) => {
          if (!c) return c;
          handleAutoAdvanceRef.current?.(c);
          return c;
        });
      });
      a.addEventListener("play", () => {
        setIsPlaying(true);
        clearLoadRef();
      });
      a.addEventListener("pause", () => setIsPlaying(false));
      a.addEventListener("waiting", () => setIsLoading(true));
      a.addEventListener("canplay", () => {
        setIsLoading(false);
        clearLoadRef();
      });
      a.addEventListener("playing", () => {
        setIsLoading(false);
        clearLoadRef();
      });
      a.addEventListener("error", () => {
        setIsLoading(false);
        setIsPlaying(false);
        onLoadFailureRef.current?.();
      });
      audioRef.current = a;
    }
    return audioRef.current;
  }, []);

  // Clear the pending load/retry state (called when an ayah loads or ends)
  const clearLoadRef = useCallback(() => {
    if (loadRef.current.timeout) {
      clearTimeout(loadRef.current.timeout);
      loadRef.current.timeout = null;
    }
    // keep globalAyah but reset retries so a fresh load always has budget
    loadRef.current.retriesLeft = 0;
  }, []);

  // Called when an ayah fails (error event) or hangs (timeout). Retries up to
  // MAX_RETRIES, otherwise skips ahead to the next ayah (failover).
  const handleLoadFailure = useCallback(() => {
    const state = loadRef.current;
    if (state.globalAyah == null) return;

    const g = state.globalAyah;
    if (state.retriesLeft > 0) {
      state.retriesLeft -= 1;
      setIsLoading(true);
      // retry the SAME ayah from scratch (re-set src to bust any cache issue)
      const audio = ensureAudio();
      audio.src = ayahAudioUrl(reciterId, g, quality);
      audio.load();
      audio.play().catch(() => {});
      // schedule a fresh timeout for this retry
      scheduleLoadTimeoutRef.current?.(g);
      return;
    }
    // no retries left -> skip to the next ayah
    const nextG = Math.min(g + 1, 6236);
    playGlobalRef.current?.(nextG, false);
  }, [ensureAudio, reciterId, quality]);

  const onLoadFailureRef = useRef<(() => void) | null>(null);
  onLoadFailureRef.current = handleLoadFailure;

  // Schedules the hang timeout for a given ayah load attempt
  const scheduleLoadTimeout = useCallback(
    (g: number) => {
      if (loadRef.current.timeout) clearTimeout(loadRef.current.timeout);
      loadRef.current.timeout = setTimeout(() => {
        // If we STILL don't have the ayah we asked for, it likely hung
        if (loadRef.current.globalAyah === g) {
          handleLoadFailure();
        }
      }, LOAD_TIMEOUT_MS);
    },
    [handleLoadFailure],
  );
  const scheduleLoadTimeoutRef = useRef<((g: number) => void) | null>(null);
  scheduleLoadTimeoutRef.current = scheduleLoadTimeout;

  // Allow the ended handler to reach the latest autoAdvance
  const handleAutoAdvanceRef = useRef<((t: QuranTrack) => void) | null>(null);

  const persistProgress = useCallback(
    (track: QuranTrack) => {
      if (!userId) return;
      saveQuranProgress({
        userId,
        reciterId: track.reciterId,
        globalAyah: track.globalAyah,
        quality: track.quality,
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
        quality,
      };
      setCurrent(track);
      persistProgress(track);
      setResumeProgress({ reciterId, globalAyah });

      // Set up the retry/failover state for this ayah
      const state = loadRef.current;
      state.globalAyah = globalAyah;
      state.retriesLeft = MAX_RETRIES;
      if (state.timeout) clearTimeout(state.timeout);

      setIsLoading(true);
      audio.src = ayahAudioUrl(reciterId, globalAyah, quality);
      scheduleLoadTimeout(globalAyah);
      audio.play().catch(() => {
        // play() rejected (e.g. autoplay blocked) -> surface as load failure
        // but don't loop infinitely; treat as a one-time failover skip later
      });
      if (auto !== false) {
        setFloatingOpen(true);
      }
    },
    [reciterId, quality, ensureAudio, persistProgress, scheduleLoadTimeout],
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

  const setQuality = useCallback(
    (q: QuranQuality) => {
      setQualityState(q);
      saveQuranQuality(q);
      if (current) {
        // reload current ayah with new quality
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
        saveQuranProgress({
          userId,
          reciterId: current.reciterId,
          globalAyah: current.globalAyah,
          quality: current.quality,
        });
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
    quality,
    reciters: QURAN_RECITERS,
    current,
    isPlaying,
    isLoading,
    isFloatingOpen,
    isDocked,
    setReciter,
    setQuality,
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
