export interface QuranProgress {
  userId: string;
  reciterId: string;
  globalAyah: number; // last played global ayah (0 = none yet)
  updatedAt: number;
}

const KEY = "studytogether:quran-progress";

export function loadQuranProgress(userId?: string): QuranProgress | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuranProgress;
    if (parsed.userId !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveQuranProgress(p: Omit<QuranProgress, "updatedAt">) {
  if (typeof window === "undefined") return;
  try {
    const entry: QuranProgress = { ...p, updatedAt: Date.now() };
    window.localStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // ignore storage errors
  }
}

export function clearQuranProgress(userId?: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as QuranProgress;
      if (!userId || parsed.userId === userId) {
        window.localStorage.removeItem(KEY);
      }
    }
  } catch {
    window.localStorage.removeItem(KEY);
  }
}
