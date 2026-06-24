import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bell,
  Calendar,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "BeautyFlow" }] }),
  component: AppShell,
});

type NavItem = { to: string; label: string; icon: any; exact?: boolean };
const NAV: NavItem[] = [
  { to: "/app", label: "Visão Geral", icon: LayoutDashboard, exact: true },
  { to: "/app/agenda", label: "Agenda", icon: Calendar },
  { to: "/app/clients", label: "Clientes & Recorrência", icon: Users },
  { to: "/app/financial", label: "Financeiro", icon: DollarSign },
  { to: "/app/sie", label: "Importar Dados", icon: Sparkles },
  { to: "/app/settings", label: "Configurações", icon: Settings },
];

const MOBILE_PRIMARY = NAV.slice(0, 4);

const PLAN_LABEL: Record<string, string> = {
  starter: "Plano Starter",
  professional: "Plano Pro",
  premium: "Plano Premium",
};

function AppShell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profileQuery = useCurrentProfile();
  const profile = profileQuery.data;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [moreOpen, setMoreOpen] = useState(false);

  const isAllowed = (itemTo: string) => {
    if (!profile) return false;
    if (profile.role === "owner" || profile.role === "admin") return true;
    if (itemTo === "/app") return !!profile.permissions?.view_dashboard;
    if (itemTo === "/app/clients") return !!profile.permissions?.view_clients;
    if (itemTo === "/app/financial") return !!profile.permissions?.view_financial;
    if (itemTo === "/app/sie") return !!profile.permissions?.view_imports;
    if (itemTo === "/app/settings") return !!profile.permissions?.view_settings;
    return true; // agenda and recurrence are always allowed
  };

  useEffect(() => {
    if (!profileQuery.isLoading && profile) {
      if (!profile.company?.onboarding_completed) {
        navigate({ to: "/onboarding" });
        return;
      }

      // Check permissions for the current path
      let allowed = true;
      if (profile.role === "employee") {
        if (pathname === "/app" && !profile.permissions?.view_dashboard) allowed = false;
        if (pathname.startsWith("/app/clients") && !profile.permissions?.view_clients)
          allowed = false;
        if (pathname.startsWith("/app/financial") && !profile.permissions?.view_financial)
          allowed = false;
        if (pathname.startsWith("/app/sie") && !profile.permissions?.view_imports) allowed = false;
        if (pathname.startsWith("/app/settings") && !profile.permissions?.view_settings)
          allowed = false;
      }

      if (!allowed) {
        toast.error("Acesso negado. Você não tem permissão para acessar esta tela.");
        navigate({ to: "/app/agenda", replace: true });
      }
    }
  }, [profile, profileQuery.isLoading, pathname, navigate]);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success("Até logo!");
    navigate({ to: "/auth", replace: true });
  }

  if (profileQuery.isLoading || !profile) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-muted-foreground text-sm">
        Carregando…
      </div>
    );
  }

  if (!profile.company?.onboarding_completed) return null;

  const initials = (profile.profile?.name ?? profile.email)
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const filteredNav = NAV.filter((item) => isAllowed(item.to));
  const mobilePrimary = filteredNav.slice(0, 4);
  const mobileMore = filteredNav.slice(4);
  const columnsCount = mobilePrimary.length + (mobileMore.length > 0 ? 1 : 0);

  return (
    <div className="min-h-dvh bg-background">
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden lg:flex w-[280px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="px-6 h-16 flex items-center gap-2.5 border-b border-sidebar-border">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl gradient-primary text-primary-foreground shadow-glow">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-semibold tracking-tight">BeautyFlow</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              retenção · receita
            </p>
          </div>
        </div>

        <nav className="px-3 py-4 space-y-0.5 flex-1 overflow-y-auto">
          {filteredNav.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                }`}
              >
                <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : ""}`} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <div className="rounded-xl bg-secondary/50 p-3">
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg gradient-primary text-[11px] font-semibold text-primary-foreground">
                {initials || "BF"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium truncate">{profile.company?.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {PLAN_LABEL[profile.company?.plan ?? "starter"] ?? "Plano Starter"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Top header */}
      <header className="lg:pl-[280px] sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-4 lg:px-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 font-semibold">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg gradient-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="text-[15px]">BeautyFlow</span>
          </div>

          {/* Search */}
          <div className="hidden md:block relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar clientes, serviços…"
              className="pl-9 h-10 bg-muted/40 border-transparent focus-visible:bg-card focus-visible:border-input"
            />
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {/* Quick actions */}
            <div className="hidden sm:flex items-center gap-1.5">
              {isAllowed("/app/clients") && (
                <Button variant="outline" size="sm" asChild>
                  <Link to="/app/clients">
                    <Plus className="h-3.5 w-3.5" /> Cliente
                  </Link>
                </Button>
              )}
              <Button size="sm" className="shadow-glow" asChild>
                <Link to="/app/agenda">
                  <Plus className="h-3.5 w-3.5" /> Agendamento
                </Link>
              </Button>
            </div>

            <Button variant="ghost" size="icon" aria-label="Notificações" className="relative">
              <Bell className="h-4 w-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Conta"
                  className="grid h-9 w-9 place-items-center rounded-full gradient-primary text-[12px] font-semibold text-primary-foreground"
                >
                  {initials || "BF"}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <p className="text-sm font-medium truncate">
                    {profile.profile?.name ?? "Sua conta"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {isAllowed("/app/settings") && (
                  <DropdownMenuItem asChild>
                    <Link to="/app/settings">
                      <Settings className="h-4 w-4 mr-2" /> Configurações
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4 mr-2" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t bg-background/95 backdrop-blur grid pb-[env(safe-area-inset-bottom)]"
        style={{
          gridTemplateColumns: `repeat(${columnsCount}, minmax(0, 1fr))`,
        }}
      >
        {mobilePrimary.map((item) => {
          const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <item.icon className="h-[18px] w-[18px]" />
              {item.label}
            </Link>
          );
        })}
        {mobileMore.length > 0 && (
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger className="flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium text-muted-foreground">
              <MoreHorizontal className="h-[18px] w-[18px]" /> Mais
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>Mais</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-3 gap-3 pt-4">
                {mobileMore.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMoreOpen(false)}
                    className="flex flex-col items-center gap-2 rounded-xl border p-4 text-xs font-medium hover:bg-accent/50"
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-primary">
                      <item.icon className="h-5 w-5" />
                    </span>
                    {item.label}
                  </Link>
                ))}
                <button
                  onClick={() => {
                    setMoreOpen(false);
                    handleSignOut();
                  }}
                  className="flex flex-col items-center gap-2 rounded-xl border p-4 text-xs font-medium hover:bg-accent/50"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-destructive/10 text-destructive">
                    <LogOut className="h-5 w-5" />
                  </span>
                  Sair
                </button>
              </div>
            </SheetContent>
          </Sheet>
        )}
      </nav>

      <main className="lg:pl-[280px] pb-24 lg:pb-0">
        <div className="mx-auto max-w-7xl p-4 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
