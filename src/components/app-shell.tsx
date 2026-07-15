import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, BookOpen, ListChecks, LogOut, GraduationCap, CalendarDays, UserSquare2, FileBarChart2, UserCog, Download, Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const LOCAL_FORCE_IMPORT_KEY = "formacao-er-force-import";

const NAV = [
  { to: "/dashboard", label: "Painel", icon: LayoutDashboard },
  { to: "/cronograma", label: "Cronograma", icon: CalendarDays },
  { to: "/formadores", label: "Formadores", icon: Users },
  { to: "/formandos", label: "Formandos", icon: UserSquare2 },
  { to: "/cursos", label: "Cursos", icon: BookOpen },
  { to: "/ufcds", label: "UFCD", icon: ListChecks },
  { to: "/relatorios", label: "Relatórios & SIGO", icon: FileBarChart2 },
  { to: "/nota-honorarios", label: "Nota de Honorários", icon: Receipt },
  { to: "/exportar", label: "Exportar / Backup", icon: Download },
  { to: "/perfil", label: "O meu perfil", icon: UserCog },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: s => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Auth state listener — refresh on identity changes
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        qc.clear();
        navigate({ to: "/auth", replace: true });
      } else if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        qc.invalidateQueries();
      }
    });
    return () => { sub.subscription.unsubscribe(); };
  }, [qc, navigate]);

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Sessão terminada");
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside
        className="w-64 shrink-0 flex flex-col text-sidebar-foreground"
        style={{ background: "var(--gradient-sidebar)" }}
      >
        <div className="h-16 flex items-center gap-3 px-5 border-b border-sidebar-border">
          <div
            className="size-9 rounded-lg grid place-items-center shadow-md ring-1 ring-white/10"
            style={{ background: "var(--gradient-header)" }}
          >
            <GraduationCap className="size-5 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-white">Elisabete Ribeiro</div>
            <div className="text-[10px] uppercase tracking-wider text-white/50">Centro de Formação</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map(item => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-150",
                  active
                    ? "bg-white/10 text-white font-medium shadow-sm"
                    : "text-white/70 hover:bg-white/5 hover:text-white",
                )}
              >
                {active && (
                  <span
                    className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full"
                    style={{ background: "var(--color-sidebar-primary)" }}
                  />
                )}
                <Icon className={cn("size-4 shrink-0 transition-colors", active ? "text-[var(--color-sidebar-primary)]" : "text-white/60 group-hover:text-white/90")} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          {typeof window !== "undefined" && Boolean((window as any).electronAPI?.isElectron) && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-white/70 hover:text-white hover:bg-white/10 mb-1"
              onClick={() => {
                window.localStorage.setItem(LOCAL_FORCE_IMPORT_KEY, "1");
                window.location.reload();
              }}
            >
              <Download className="size-4" /> Importar backup
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-white/70 hover:text-white hover:bg-white/10"
            onClick={handleSignOut}
          >
            <LogOut className="size-4" /> Sair
          </Button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="relative mb-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-header)" }}>{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-1.5">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      <div className="mt-4 h-px w-full bg-gradient-to-r from-border via-border to-transparent" />
    </div>
  );
}

export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="p-6 lg:p-8 max-w-7xl mx-auto">{children}</div>;
}
