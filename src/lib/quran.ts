import { SURAHS, TOTAL_AYAHS, type Surah } from "./quran-surahs";

export { SURAHS, TOTAL_AYAHS, type Surah };

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

export function ayahAudioUrl(reciterId: string, globalAyah: number) {
  return `https://cdn.islamic.network/quran/audio/128/${reciterId}/${globalAyah}.mp3`;
}

// Strip diacritics for more readable short names in tight UIs
export function surahShortName(n: number) {
  const s = getSurah(n);
  return s.name.replace(/[\u064B-\u0652\u0670]/g, "").replace(/\s+/g, " ").trim();
}
