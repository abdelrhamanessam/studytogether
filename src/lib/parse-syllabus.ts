export interface ParsedUnit {
  name: string;
  lessons: string[];
  parts: string[][];
}

export function parseSyllabusText(text: string): ParsedUnit[] {
  const lines = text.split("\n");
  const units: ParsedUnit[] = [];
  let currentUnit: ParsedUnit | null = null;
  let currentLessonIdx = -1;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    const trimmed = line.trim();

    // Check indent level: 2+ leading spaces or tabs = sub-item (part)
    const indentMatch = line.match(/^(\s{2,}|\t+)/);
    const isIndented = !!indentMatch;

    if (isIndented) {
      // Indented line = part of current lesson
      const partMatch = trimmed.match(/^[-*]\s+(.+)/);
      const numberedPartMatch = trimmed.match(/^\d+[.)]\s+(.+)/);

      if ((partMatch || numberedPartMatch) && currentUnit && currentLessonIdx >= 0) {
        const partName = (partMatch ? partMatch[1] : numberedPartMatch![1]).trim();
        currentUnit.parts[currentLessonIdx] = currentUnit.parts[currentLessonIdx] || [];
        currentUnit.parts[currentLessonIdx].push(partName);
      }
      continue;
    }

    // Non-indented: check if it's a header (unit), bullet (lesson), numbered, or plain text

    // Format 1: Markdown headings => new unit
    const headerMatch = trimmed.match(/^#{1,3}\s+(.+)/);
    if (headerMatch) {
      currentUnit = { name: headerMatch[1].trim(), lessons: [], parts: [] };
      units.push(currentUnit);
      currentLessonIdx = -1;
      continue;
    }

    // Format 2: Markdown bullets => lesson under current unit
    const lessonMatch = trimmed.match(/^[-*]\s+(.+)/);
    if (lessonMatch) {
      const lessonName = lessonMatch[1].trim();
      if (!currentUnit) {
        currentUnit = { name: "Lessons", lessons: [], parts: [] };
        units.push(currentUnit);
      }
      currentLessonIdx = currentUnit.lessons.length;
      currentUnit.lessons.push(lessonName);
      currentUnit.parts.push([]);
      continue;
    }

    // Format 3: hierarchical numbering
    const numberedMatch = trimmed.match(/^(\d+(?:\.\d+)*)\s+(.+)/);
    if (numberedMatch) {
      const numbering = numberedMatch[1];
      const name = numberedMatch[2].trim();
      const dotCount = (numbering.match(/\./g) || []).length;

      if (dotCount === 0) {
        // top-level number => unit
        currentUnit = { name: `${numbering}. ${name}`, lessons: [], parts: [] };
        units.push(currentUnit);
        currentLessonIdx = -1;
      } else {
        // dotted number => lesson
        if (!currentUnit) {
          currentUnit = { name: "Lessons", lessons: [], parts: [] };
          units.push(currentUnit);
        }
        currentLessonIdx = currentUnit.lessons.length;
        currentUnit.lessons.push(name);
        currentUnit.parts.push([]);
      }
      continue;
    }

    // Format 4: fallback plain-text line => lesson
    if (currentUnit && trimmed.length > 0 && trimmed.length < 200) {
      if (!/^\d+$/.test(trimmed) && !/^[A-Z]{2,}\s/.test(trimmed)) {
        currentLessonIdx = currentUnit.lessons.length;
        currentUnit.lessons.push(trimmed);
        currentUnit.parts.push([]);
      }
    }
  }

  return units.filter((u) => u.lessons.length > 0 || u.name !== "Lessons");
}
