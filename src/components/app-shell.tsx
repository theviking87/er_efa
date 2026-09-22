import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, BookOpen, ListChecks, LogOut, GraduationCap, CalendarDays, UserSquare2, FileBarChart2, UserCog, Download, Wallet, Settings2, ClipboardList, FolderKanban, Receipt, ShoppingCart, FileSignature, FolderCheck, History as HistoryIcon, Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useProjetoAtivo, useProjetosList } from "@/lib/projeto-context";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

const NAV = [
  { to: "/dashboard", label: "Painel", icon: LayoutDashboard, section: "Geral" },
  { to: "/projetos", label: "Projetos", icon: FolderKanban, section: "Geral" },
  { to: "/cronograma", label: "Cronograma", icon: CalendarDays, section: "Geral" },
  { to: "/formadores", label: "Formadores", icon: Users, section: "Geral" },
  { to: "/formandos", label: "Formandos", icon: UserSquare2, section: "Geral" },
  { to: "/cursos", label: "Cursos", icon: BookOpen, section: "Geral" },
  { to: "/ufcds", label: "UFCD", icon: ListChecks, section: "Geral" },
  { to: "/relatorios", label: "Relatórios & SIGO", icon: FileBarChart2, section: "Geral" },
  { to: "/contratos/formador", label: "Contrato de Formador", icon: FileSignature, section: "Contratos" },
  { to: "/contratos/formando", label: "Contrato de Formando", icon: FileSignature, section: "Contratos" },
  { to: "/contratos/historico", label: "Histórico", icon: HistoryIcon, section: "Contratos" },
  { to: "/documentacao", label: "Gestão de Documentação", icon: FolderCheck, section: "Documentação" },
  { to: "/financeiro", label: "Painel", icon: Wallet, section: "Financeiro" },
  { to: "/financeiro/processamentos", label: "Proc. Formandos", icon: ClipboardList, section: "Financeiro" },
  { to: "/financeiro/formadores", label: "Proc. Formadores", icon: Receipt, section: "Financeiro" },
  { to: "/financeiro/despesas", label: "Despesas", icon: ShoppingCart, section: "Financeiro" },
  { to: "/nota-honorarios", label: "Nota de Honorários (avulso)", icon: Receipt, section: "Financeiro" },
  { to: "/financeiro/configuracao", label: "Configuração", icon: Settings2, section: "Financeiro" },
  { to: "/exportar", label: "Exportar / Backup", icon: Download, section: "Sistema" },
  { to: "/perfil", label: "O meu perfil", icon: UserCog, section: "Sistema" },
] as const;


export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: s => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    <div className="min-h-screen flex flex-col bg-background text-foreground md:flex-row">
      <header className="fixed inset-x-0 top-0 z-40 grid h-14 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-b border-sidebar-border px-3 text-sidebar-foreground md:hidden" style={{ background: "var(--gradient-sidebar)" }}>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-white hover:bg-white/10 hover:text-white"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Abrir menu"
        >
          <Menu className="size-5" />
        </Button>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold text-white">Gestão de Formação</div>
          <div className="truncate text-[10px] text-white/55">Elisabete Ribeiro</div>
        </div>
      </header>

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-[min(86vw,20rem)] border-sidebar-border p-0 text-sidebar-foreground [&>button]:text-white" style={{ background: "var(--gradient-sidebar)" }}>
          <SheetTitle className="sr-only">Menu principal</SheetTitle>
          <SidebarContent pathname={pathname} onNavigate={() => setMobileMenuOpen(false)} onSignOut={handleSignOut} />
        </SheetContent>
      </Sheet>

      <aside
        className="hidden w-64 shrink-0 flex-col text-sidebar-foreground md:flex"
        style={{ background: "var(--gradient-sidebar)" }}
      >
        <SidebarContent pathname={pathname} onSignOut={handleSignOut} />
      </aside>

      <main className="min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  );
}

function SidebarContent({ pathname, onNavigate, onSignOut }: { pathname: string; onNavigate?: () => void; onSignOut: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="h-16 shrink-0 flex items-center gap-3 px-5 border-b border-sidebar-border">
        <div className="size-9 shrink-0 rounded-lg grid place-items-center shadow-md ring-1 ring-white/10" style={{ background: "var(--gradient-header)" }}>
          <GraduationCap className="size-5 text-white" />
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold text-white">Elisabete Ribeiro</div>
          <div className="truncate text-[10px] uppercase tracking-wider text-white/50">Centro de Formação</div>
        </div>
      </div>

      <div className="shrink-0 px-3 pt-3 pb-2 border-b border-sidebar-border">
        <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1.5 flex items-center gap-1.5">
          <FolderKanban className="size-3" /> Projeto ativo
        </div>
        <ProjetoSelector />
      </div>

      <nav className="flex-1 px-3 py-2 space-y-4 overflow-y-auto overscroll-contain">
        {Array.from(new Set(NAV.map(n => n.section))).map(section => (
          <div key={section} className="space-y-1">
            <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-white/40">{section}</div>
            {NAV.filter(n => n.section === section).map(item => {
              const active = item.to === "/financeiro"
                ? pathname === item.to
                : pathname === item.to || pathname.startsWith(item.to + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  className={cn(
                    "group relative flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm transition-all duration-150",
                    active ? "bg-white/10 text-white font-medium shadow-sm" : "text-white/70 hover:bg-white/5 hover:text-white",
                  )}
                >
                  {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full" style={{ background: "var(--color-sidebar-primary)" }} />}
                  <Icon className={cn("size-4 shrink-0 transition-colors", active ? "text-[var(--color-sidebar-primary)]" : "text-white/60 group-hover:text-white/90")} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="shrink-0 p-3 border-t border-sidebar-border">
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-white/70 hover:text-white hover:bg-white/10" onClick={onSignOut}>
          <LogOut className="size-4" /> Sair
        </Button>
      </div>
    </div>
  );
}

function ProjetoSelector() {
  const { projetoId, setProjetoId } = useProjetoAtivo();
  const { data } = useProjetosList();
  return (
    <Select value={projetoId} onValueChange={setProjetoId}>
      <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10 text-white hover:bg-white/10">
        <SelectValue placeholder="Todos os projetos" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos os projetos</SelectItem>
        {(data ?? []).map(p => (
          <SelectItem key={p.id} value={p.id}>{p.codigo} — {p.nome}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="relative mb-6 sm:mb-8">
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold tracking-tight bg-clip-text text-transparent sm:text-3xl" style={{ backgroundImage: "var(--gradient-header)" }}>{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-1.5">{description}</p>}
        </div>
        {actions && <div className="flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">{actions}</div>}
      </div>
      <div className="mt-4 h-px w-full bg-gradient-to-r from-border via-border to-transparent" />
    </div>
  );
}

export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full min-w-0 max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>;
}
