import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Calendar,
  Heart,
  LayoutDashboard,
  LogOut,
  Scissors,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "BeautyFlow" }] }),
  component: AppShell,
});

type NavItem = { to: string; label: string; icon: any; exact?: boolean; highlight?: boolean };
const NAV: NavItem[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/returns", label: "Retornos", icon: TrendingUp, highlight: true },
  { to: "/app/agenda", label: "Agenda", icon: Calendar },
  { to: "/app/clients", label: "Clientes", icon: Users },
  { to: "/app/services", label: "Serviços", icon: Scissors },
];

function AppShell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profileQuery = useCurrentProfile();
  const profile = profileQuery.data;
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!profileQuery.isLoading && profile && !profile.company?.onboarding_completed) {
      navigate({ to: "/onboarding" });
    }
  }, [profile, profileQuery.isLoading, navigate]);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success("Até logo!");
    navigate({ to: "/auth", replace: true });
  }

  if (profileQuery.isLoading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        Carregando…
      </div>
    );
  }

  if (!profile.company?.onboarding_completed) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 hidden lg:flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="px-5 h-16 flex items-center gap-2 font-semibold">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg gradient-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          BeautyFlow
        </div>
        <nav className="px-3 py-2 space-y-1 flex-1">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                }`}
              >
                <item.icon className={`h-4 w-4 ${item.highlight ? "text-primary" : ""}`} />
                <span>{item.label}</span>
                {item.highlight && (
                  <Heart className="ml-auto h-3 w-3 text-primary" aria-hidden />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-4 space-y-3">
          <div className="text-xs">
            <p className="font-medium truncate">{profile.company?.name}</p>
            <p className="text-muted-foreground truncate">{profile.email}</p>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur">
        <div className="flex items-center gap-2 font-semibold">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md gradient-primary text-primary-foreground">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          BeautyFlow
        </div>
        <Button variant="ghost" size="sm" onClick={handleSignOut}><LogOut className="h-4 w-4" /></Button>
      </header>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-20 border-t bg-background/95 backdrop-blur grid grid-cols-5">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <main className="lg:pl-64 pb-24 lg:pb-0">
        <div className="mx-auto max-w-6xl p-4 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
