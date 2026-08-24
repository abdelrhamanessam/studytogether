export interface AppTheme {
  [key: string]: string;
}

const DEFAULT_THEME: AppTheme = {
  "--background": "#0f0f14",
  "--foreground": "#e8e8ed",
  "--card": "#1a1a24",
  "--card-foreground": "#e8e8ed",
  "--primary": "#7c6cf7",
  "--primary-light": "#b2a9fe",
  "--primary-dark": "#6c5ce7",
  "--secondary": "#00e0db",
  "--accent": "#ff8cb3",
  "--success": "#00d9a7",
  "--warning": "#ffe066",
  "--danger": "#ff7675",
  "--muted": "#22222e",
  "--muted-foreground": "#8b8ba0",
  "--border": "#2a2a38",
  "--ring": "#7c6cf7",
  "--xp-gradient-from": "#7c6cf7",
  "--xp-gradient-to": "#b2a9fe",
  "--level-glow": "rgba(124, 108, 247, 0.4)",
};

export const THEMES: Record<string, AppTheme> = {
  // Gradient Waves: Purple/Cyan glow — elegant, modern
  "bg-gradient-waves": {
    ...DEFAULT_THEME,
    "--background": "#0d0a1a",
    "--card": "#161030",
    "--primary": "#9b8cff",
    "--primary-light": "#c4b8ff",
    "--primary-dark": "#7c6cf7",
    "--secondary": "#00e0db",
    "--accent": "#ff8cb3",
    "--muted": "#1a1235",
    "--border": "#2d2250",
    "--ring": "#9b8cff",
    "--xp-gradient-from": "#9b8cff",
    "--xp-gradient-to": "#c4b8ff",
    "--level-glow": "rgba(155, 140, 255, 0.4)",
  },

  // Aurora: Emerald/Teal — nature, calm
  "bg-aurora": {
    ...DEFAULT_THEME,
    "--background": "#05100e",
    "--card": "#0c1f1a",
    "--primary": "#00d4aa",
    "--primary-light": "#40f0d0",
    "--primary-dark": "#00a885",
    "--secondary": "#0984e3",
    "--accent": "#6c5ce7",
    "--muted": "#0a1820",
    "--border": "#153030",
    "--ring": "#00d4aa",
    "--xp-gradient-from": "#00d4aa",
    "--xp-gradient-to": "#40f0d0",
    "--level-glow": "rgba(0, 212, 170, 0.4)",
  },

  // Particle Rain: Violet/Magenta — dreamy, magical
  "bg-particle-rain": {
    ...DEFAULT_THEME,
    "--background": "#0e0618",
    "--card": "#1a0e30",
    "--primary": "#b08aff",
    "--primary-light": "#d0b8ff",
    "--primary-dark": "#8a5cf7",
    "--secondary": "#00cec9",
    "--accent": "#fd79a8",
    "--muted": "#180e28",
    "--border": "#2a1848",
    "--ring": "#b08aff",
    "--xp-gradient-from": "#b08aff",
    "--xp-gradient-to": "#d0b8ff",
    "--level-glow": "rgba(176, 138, 255, 0.4)",
  },

  // Matrix: Neon Green — hacker, terminal
  "bg-matrix": {
    ...DEFAULT_THEME,
    "--background": "#040d06",
    "--card": "#0a1a0e",
    "--primary": "#00ff65",
    "--primary-light": "#60ff98",
    "--primary-dark": "#00cc50",
    "--secondary": "#00e0db",
    "--accent": "#39ff8a",
    "--muted": "#081510",
    "--border": "#122818",
    "--ring": "#00ff65",
    "--xp-gradient-from": "#00ff65",
    "--xp-gradient-to": "#60ff98",
    "--level-glow": "rgba(0, 255, 101, 0.35)",
    "--foreground": "#c8ffd8",
    "--card-foreground": "#c8ffd8",
  },

  // Starry Night: Indigo/Gold — cosmic, elegant
  "bg-starry": {
    ...DEFAULT_THEME,
    "--background": "#06061a",
    "--card": "#0e0e28",
    "--primary": "#a0a0ff",
    "--primary-light": "#c8c8ff",
    "--primary-dark": "#7878e0",
    "--secondary": "#ffe066",
    "--accent": "#ff8cb3",
    "--muted": "#0a0a20",
    "--border": "#1a1a40",
    "--ring": "#a0a0ff",
    "--xp-gradient-from": "#a0a0ff",
    "--xp-gradient-to": "#c8c8ff",
    "--level-glow": "rgba(160, 160, 255, 0.35)",
  },

  // Underwater: Deep Blue — oceanic, serene
  "bg-underwater": {
    ...DEFAULT_THEME,
    "--background": "#040e18",
    "--card": "#0a1828",
    "--primary": "#00b4d8",
    "--primary-light": "#48cae4",
    "--primary-dark": "#0096c7",
    "--secondary": "#00e0db",
    "--accent": "#48cae4",
    "--muted": "#081420",
    "--border": "#122838",
    "--ring": "#00b4d8",
    "--xp-gradient-from": "#00b4d8",
    "--xp-gradient-to": "#48cae4",
    "--level-glow": "rgba(0, 180, 216, 0.35)",
  },

  // Cozy Fireplace: Warm Orange — warm, cozy
  "bg-fireplace": {
    ...DEFAULT_THEME,
    "--background": "#120a06",
    "--card": "#1e1008",
    "--primary": "#ff8040",
    "--primary-light": "#ffb080",
    "--primary-dark": "#e06020",
    "--secondary": "#ff4500",
    "--accent": "#ffcc00",
    "--muted": "#1a0e08",
    "--border": "#301810",
    "--ring": "#ff8040",
    "--xp-gradient-from": "#ff8040",
    "--xp-gradient-to": "#ffb080",
    "--level-glow": "rgba(255, 128, 64, 0.35)",
  },

  // Anime Study Room: Soft Pink/Lavender — lo-fi, cozy
  "bg-anime-room": {
    ...DEFAULT_THEME,
    "--background": "#0e0618",
    "--card": "#1a0e28",
    "--primary": "#e090c0",
    "--primary-light": "#f0b0d8",
    "--primary-dark": "#c070a0",
    "--secondary": "#90b0ff",
    "--accent": "#ff90c0",
    "--muted": "#160e22",
    "--border": "#281838",
    "--ring": "#e090c0",
    "--xp-gradient-from": "#e090c0",
    "--xp-gradient-to": "#f0b0d8",
    "--level-glow": "rgba(224, 144, 192, 0.35)",
  },

  // Space Galaxy: Deep Indigo — cosmic, immersive
  "bg-galaxy": {
    ...DEFAULT_THEME,
    "--background": "#050510",
    "--card": "#0c0c1e",
    "--primary": "#8080ff",
    "--primary-light": "#b0b0ff",
    "--primary-dark": "#6060d0",
    "--secondary": "#c080ff",
    "--accent": "#ff80c0",
    "--muted": "#0a0a18",
    "--border": "#181830",
    "--ring": "#8080ff",
    "--xp-gradient-from": "#8080ff",
    "--xp-gradient-to": "#b0b0ff",
    "--level-glow": "rgba(128, 128, 255, 0.35)",
  },

  // Rainy Window: Steel Blue — melancholy, peaceful
  "bg-rain": {
    ...DEFAULT_THEME,
    "--background": "#080c14",
    "--card": "#101828",
    "--primary": "#6ca0d0",
    "--primary-light": "#90c0e8",
    "--primary-dark": "#5088c0",
    "--secondary": "#8090a0",
    "--accent": "#6ca0d0",
    "--muted": "#0c1018",
    "--border": "#1a2838",
    "--ring": "#6ca0d0",
    "--xp-gradient-from": "#6ca0d0",
    "--xp-gradient-to": "#90c0e8",
    "--level-glow": "rgba(108, 160, 208, 0.35)",
  },
};

export function getTheme(backgroundCssClass: string | null | undefined): AppTheme {
  if (!backgroundCssClass || !THEMES[backgroundCssClass]) {
    return DEFAULT_THEME;
  }
  return THEMES[backgroundCssClass];
}
