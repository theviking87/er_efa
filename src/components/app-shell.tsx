import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, BookOpen, ListChecks, LogOut, GraduationCap, CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const NAV = [
  { to: "/dashboard", label: "Painel", icon: LayoutDashboard },
  { to: "/cronograma", label: "Cronograma", icon: CalendarDays },
  { to: "/formadores", label: "Formadores", icon: Users },
  { to: "/cursos", label: "Cursos", icon: BookOpen },
  { to: "/ufcds", label: "UFCD", icon: ListChecks },
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
      <aside className="w-60 shrink-0 border-r border-border bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="h-14 flex items-center gap-2 px-4 border-b border-sidebar-border">
          <div className="size-7 rounded-md bg-foreground text-background grid place-items-center">
            <GraduationCap className="size-4" />
          </div>
          <div className="text-sm font-semibold tracking-tight leading-none">
            Elisbate Ribeiro
            <div className="text-[10px] font-normal text-muted-foreground mt-0.5">Centro de Formação</div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {NAV.map(item => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-2 border-t border-sidebar-border">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={handleSignOut}>
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
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="p-6 lg:p-8 max-w-7xl">{children}</div>;
}
