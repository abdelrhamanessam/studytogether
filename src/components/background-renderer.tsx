"use client";

interface BackgroundRendererProps {
  cssClass: string | null | undefined;
}

export function BackgroundRenderer({ cssClass }: BackgroundRendererProps) {
  if (!cssClass) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: -1,
        pointerEvents: "none",
      }}
      className={cssClass}
    />
  );
}
