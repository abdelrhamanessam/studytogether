import { BookOpen, Zap } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-secondary/5 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md animate-slide-up">
        <div className="mb-8 text-center animate-fade-in">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm text-primary-light">
            <BookOpen className="h-4 w-4" />
            <span>StudyTogether</span>
            <Zap className="h-3.5 w-3.5" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Competitive Study Platform
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Earn XP, level up, and study alongside others
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card/80 p-8 shadow-xl backdrop-blur-sm">
          {children}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Built for students who thrive on competition
        </p>
      </div>
    </div>
  );
}
