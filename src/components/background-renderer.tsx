"use client";

import { useEffect, useRef } from "react";

interface BackgroundRendererProps {
  cssClass: string | null | undefined;
}

export function BackgroundRenderer({ cssClass }: BackgroundRendererProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cssClass || !ref.current) return;
    const el = ref.current;

    let scrollTimer: number | undefined;

    const pause = () => {
      if (!el.classList.contains("bg-scroll-pause")) {
        el.classList.add("bg-scroll-pause");
        // Force one compositing frame so the pause is visible immediately.
        void el.offsetWidth;
      }
    };
    const resume = () => {
      el.classList.remove("bg-scroll-pause");
    };
    const scheduleResume = () => {
      if (scrollTimer) window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(resume, 120);
    };

    // scroll (and touch) events don't bubble, so use the capture phase to
    // catch scrolls from the inner overflow container.
    const onScroll = () => {
      pause();
      scheduleResume();
    };

    const onVisibility = () => {
      if (document.hidden) pause();
      else resume();
    };

    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("visibilitychange", onVisibility);
      if (scrollTimer) window.clearTimeout(scrollTimer);
    };
  }, [cssClass]);

  if (!cssClass) return null;

  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: -1,
        pointerEvents: "none",
        transform: "translateZ(0)",
        willChange: "transform",
        backfaceVisibility: "hidden",
      }}
      className={cssClass}
    />
  );
}
