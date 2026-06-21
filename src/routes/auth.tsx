import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { GraduationCap } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  head: () => ({ meta: [{ title: "Entrar — Gestão Pedagógica" }] }),
  component: AuthPage,
});

function AuthPage() {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-foreground text-background p-12">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-md bg-background text-foreground grid place-items-center">
            <GraduationCap className="size-5" />
          </div>
          <span className="font-semibold tracking-tight">Elisbate Ribeiro</span>
        </div>
        <div className="space-y-4 max-w-md">
          <h1 className="text-4xl font-semibold leading-tight">Gestão pedagógica, cronogramas e SIGO.</h1>
          <p className="text-background/70 text-sm leading-relaxed">
            Plataforma interna do Centro de Formação. Cursos EFA, ERFA, MFA — formadores,
            UFCD, cronogramas e exportações num só lugar.
          </p>
        </div>
        <div className="text-xs text-background/50">© {new Date().getFullYear()} Elisbate Ribeiro — Centro de Formação</div>
      </div>
      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden flex items-center gap-2 mb-6">
            <div className="size-9 rounded-md bg-foreground text-background grid place-items-center">
              <GraduationCap className="size-4" />
            </div>
            <span className="font-semibold tracking-tight">Elisbate Ribeiro</span>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Aceder ao sistema</h2>
            <p className="text-sm text-muted-foreground mt-1">Inicie sessão ou crie uma conta de utilizador.</p>
          </div>
          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Registar</TabsTrigger>
            </TabsList>
            <TabsContent value="signin"><SignInForm /></TabsContent>
            <TabsContent value="signup"><SignUpForm /></TabsContent>
          </Tabs>
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { toast.error("Não foi possível entrar", { description: error.message }); return; }
    toast.success("Sessão iniciada");
    navigate({ to: "/dashboard" });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="signin-email">Email</Label>
        <Input id="signin-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signin-password">Palavra-passe</Label>
        <Input id="signin-password" type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "A entrar…" : "Entrar"}</Button>
    </form>
  );
}

function SignUpForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    setLoading(false);
    if (error) { toast.error("Não foi possível registar", { description: error.message }); return; }
    toast.success("Conta criada", { description: "Pode iniciar sessão." });
    navigate({ to: "/dashboard" });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="signup-email">Email</Label>
        <Input id="signup-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-password">Palavra-passe</Label>
        <Input id="signup-password" type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "A criar…" : "Criar conta"}</Button>
    </form>
  );
}
