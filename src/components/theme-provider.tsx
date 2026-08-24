"use client";

import { useEffect, useState } from "react";
import { getTheme } from "@/lib/themes";

interface ThemeProviderProps {
  backgroundCssClass: string | null | undefined;
  children: React.ReactNode;
}

export function ThemeProvider({ backgroundCssClass, children }: ThemeProviderProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const theme = getTheme(backgroundCssClass);
    const root = document.documentElement;
    for (const [key, value] of Object.entries(theme)) {
      if (key.startsWith("--")) {
        root.style.setProperty(key, value);
      }
    }
  }, [mounted, backgroundCssClass]);

  useEffect(() => {
    if (!mounted) return;
    return () => {
      const root = document.documentElement;
      const theme = getTheme(null);
      for (const key of Object.keys(theme)) {
        if (key.startsWith("--")) {
          root.style.removeProperty(key);
        }
      }
    };
  }, [mounted]);

  return <>{children}</>;
}
