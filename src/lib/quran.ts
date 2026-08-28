import { SURAHS, TOTAL_AYAHS, type Surah } from "./quran-surahs";

export { SURAHS, TOTAL_AYAHS, type Surah };

export type QuranQuality = "high" | "low";

export interface QuranQualityOption {
  id: QuranQuality;
  bitrate: number;
  label: string;
  hint: string;
}

export const QURAN_QUALITIES: QuranQualityOption[] = [
  { id: "high", bitrate: 128, label: "جودة عالية", hint: "أفضل صوت (~58MB/ساعة)" },
  { id: "low", bitrate: 64, label: "جودة منخفضة", hint: "أقل استهلاك للنِت (~29MB/ساعة)" },
];

export const DEFAULT_QUALITY: QuranQuality = "high";

// Reciters that currently only have the 128kbps files on the CDN.
// Low-quality (64kbps) is not available for them, so request falls back to 128.
const LOW_QUALITY_UNAVAILABLE: Record<string, boolean> = {
  "ar.minshawi": true,
};

export function reciterSupportsLowQuality(reciterId: string) {
  return !LOW_QUALITY_UNAVAILABLE[reciterId];
}

export function effectiveBitrate(reciterId: string, quality: QuranQuality) {
  if (quality === "low" && !reciterSupportsLowQuality(reciterId)) {
    return 128;
  }
  return quality === "low" ? 64 : 128;
}

export interface QuranReciter {
  id: string;
  name: string;
  engName: string;
}

export const QURAN_RECITERS: QuranReciter[] = [
  { id: "ar.minshawi", name: "محمد صديق المنشاوي", engName: "Minshawi" },
  { id: "ar.husary", name: "محمود خليل الحصري", engName: "Husary" },
  { id: "ar.mahermuaiqly", name: "ماهر المعيقلي", engName: "Maher Al-Muaiqly" },
];

export const DEFAULT_RECITER = QURAN_RECITERS[0].id;

export function getSurah(n: number) {
  return SURAHS.find((s) => s.n === n) ?? SURAHS[0];
}

export function getSurahByGlobalAyah(globalAyah: number) {
  const clamped = Math.min(Math.max(globalAyah, 1), 6236);
  for (let i = SURAHS.length - 1; i >= 0; i--) {
    if (SURAHS[i].start <= clamped) return SURAHS[i];
  }
  return SURAHS[0];
}

export function surahFirstGlobalAyah(n: number) {
  return getSurah(n).start;
}

export function surahAyahToGlobal(n: number, ayah: number) {
  return surahFirstGlobalAyah(n) + ayah - 1;
}

export function globalAyahToSurahAyah(globalAyah: number) {
  const surah = getSurahByGlobalAyah(globalAyah);
  return { surah, ayah: globalAyah - surah.start + 1 };
}

export function ayahAudioUrl(reciterId: string, globalAyah: number, quality: QuranQuality = "high") {
  const bitrate = effectiveBitrate(reciterId, quality);
  return `https://cdn.islamic.network/quran/audio/${bitrate}/${reciterId}/${globalAyah}.mp3`;
}

// Strip diacritics for more readable short names in tight UIs
export function surahShortName(n: number) {
  const s = getSurah(n);
  return s.name.replace(/[\u064B-\u0652\u0670]/g, "").replace(/\s+/g, " ").trim();
}
