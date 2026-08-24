import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { BackgroundRenderer } from "@/components/background-renderer";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, level, xp, coins, current_streak, equipped_background, equipped_title, equipped_badge, equipped_name_effect")
    .eq("id", user.id)
    .single();

  const sidebarUser = profile
    ? {
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        level: profile.level,
        xp: profile.xp,
        coins: profile.coins,
        current_streak: profile.current_streak,
        equipped_title: (profile.equipped_title as { text: string; color: string } | null) ?? null,
        equipped_badge: (profile.equipped_badge as { icon: string; color: string } | null) ?? null,
        name_effect: ((profile.equipped_name_effect as { effect: string } | null)?.effect) ?? null,
      }
    : null;

  const bg = profile?.equipped_background as { type: string; value: string } | null;
  const bgCssClass = bg?.type === "css" ? bg.value : null;

  return (
    <ThemeProvider backgroundCssClass={bgCssClass}>
      <BackgroundRenderer cssClass={bgCssClass} />
      <AppShell user={sidebarUser}>{children}</AppShell>
    </ThemeProvider>
  );
}
