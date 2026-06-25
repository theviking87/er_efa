import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { GraduationCap } from "lucide-react";
import { ensureFixedUser } from "@/lib/bootstrap-user.functions";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Entrar — Gestão Pedagógica" }] }),
  component: AuthPage,
});

const USERNAME_DOMAIN = "app.local";

function AuthPage() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-foreground text-background p-12">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-md bg-background text-foreground grid place-items-center">
            <GraduationCap className="size-5" />
          </div>
          <span className="font-semibold tracking-tight">Elisabete Ribeiro</span>
        </div>
        <div className="space-y-4 max-w-md">
          <h1 className="text-4xl font-semibold leading-tight">Gestão pedagógica, cronogramas e SIGO.</h1>
          <p className="text-background/70 text-sm leading-relaxed">
            Plataforma interna do Centro de Formação. Cursos EFA, ERFA, MFA — formadores,
            UFCD, cronogramas e exportações num só lugar.
          </p>
        </div>
        <div className="text-xs text-background/50">© {new Date().getFullYear()} Elisabete Ribeiro — Centro de Formação</div>
      </div>
      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden flex items-center gap-2 mb-6">
            <div className="size-9 rounded-md bg-foreground text-background grid place-items-center">
              <GraduationCap className="size-4" />
            </div>
            <span className="font-semibold tracking-tight">Elisabete Ribeiro</span>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Aceder ao sistema</h2>
            <p className="text-sm text-muted-foreground mt-1">Inicie sessão com o nome de utilizador e palavra-passe.</p>
          </div>
          <SignInForm />
          <p className="text-xs text-muted-foreground text-center">
            <Link to="/" className="hover:underline">Voltar ao início</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function SignInForm() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const email = `${username.trim().toLowerCase()}@${USERNAME_DOMAIN}`;

    let { error } = await supabase.auth.signInWithPassword({ email, password });

    // If the fixed user doesn't exist yet, bootstrap it and retry once.
    if (error && /invalid login credentials/i.test(error.message)) {
      try {
        await ensureFixedUser();
        const retry = await supabase.auth.signInWithPassword({ email, password });
        error = retry.error;
      } catch {
        // ignore — fall through to error toast below
      }
    }

    setLoading(false);
    if (error) {
      toast.error("Não foi possível entrar", { description: "Utilizador ou palavra-passe incorretos." });
      return;
    }
    toast.success("Sessão iniciada");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="signin-username">Nome de utilizador</Label>
        <Input
          id="signin-username"
          type="text"
          required
          value={username}
          onChange={e => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signin-password">Palavra-passe</Label>
        <Input id="signin-password" type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "A entrar…" : "Entrar"}</Button>
    </form>
  );
}
