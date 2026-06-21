import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageContainer, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { KeyRound, Mail } from "lucide-react";

export const Route = createFileRoute("/_authenticated/perfil")({
  component: PerfilPage,
});

function PerfilPage() {
  const [email, setEmail] = useState<string>("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) {
      toast.error("A password deve ter pelo menos 8 caracteres");
      return;
    }
    if (pw !== pw2) {
      toast.error("As passwords não coincidem");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPw("");
    setPw2("");
    toast.success("Password alterada com sucesso");
  }

  return (
    <AppShell>
      <PageContainer>
        <PageHeader title="O meu perfil" description="Gestão da conta e credenciais de acesso" />

        <div className="grid gap-6 max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="size-4" /> Conta
              </CardTitle>
              <CardDescription>Email associado à sessão atual</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-medium">{email || "—"}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="size-4" /> Alterar password
              </CardTitle>
              <CardDescription>Define uma nova password com pelo menos 8 caracteres</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pw">Nova password</Label>
                  <Input
                    id="pw"
                    type="password"
                    value={pw}
                    onChange={e => setPw(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={8}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pw2">Confirmar nova password</Label>
                  <Input
                    id="pw2"
                    type="password"
                    value={pw2}
                    onChange={e => setPw2(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={8}
                  />
                </div>
                <Button type="submit" disabled={loading}>
                  {loading ? "A guardar…" : "Atualizar password"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    </AppShell>
  );
}
