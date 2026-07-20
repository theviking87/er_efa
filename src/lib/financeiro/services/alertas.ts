// Motor de alertas — Fase 1. Detecções não-bloqueantes que a
// dashboard/pages podem consumir.
import { supabase } from "@/integrations/supabase/client";
import { obterConfiguracaoAtiva } from "./config-global";

export type FinAlerta = {
  id: string;
  nivel: "info" | "aviso" | "erro";
  titulo: string;
  detalhe?: string;
  href?: string;
};

export async function calcularAlertas(): Promise<FinAlerta[]> {
  const alertas: FinAlerta[] = [];

  const cfg = await obterConfiguracaoAtiva();
  if (!cfg) {
    alertas.push({
      id: "cfg-em-falta",
      nivel: "aviso",
      titulo: "Configuração financeira em falta",
      detalhe: "Ainda não existe uma configuração global ativa.",
      href: "/financeiro/configuracao",
    });
  }

  // Rubricas ativas sem qualquer regra
  const rubs = await (supabase as any).from("fin_rubricas").select("id, codigo, descricao, ativo");
  const rubList = (rubs.data ?? []) as any[];
  if (rubList.length) {
    const regras = await (supabase as any)
      .from("fin_rubrica_regras")
      .select("rubrica_id")
      .eq("ativo", true);
    const semRegra = new Set(rubList.filter(r => r.ativo).map(r => r.id));
    (regras.data ?? []).forEach((r: any) => semRegra.delete(r.rubrica_id));
    semRegra.forEach((id) => {
      const r = rubList.find(x => x.id === id);
      alertas.push({
        id: `rubrica-sem-regra-${id}`,
        nivel: "aviso",
        titulo: `Rubrica ${r?.codigo} sem regra ativa`,
        detalhe: r?.descricao,
        href: "/financeiro/regras",
      });
    });
  }

  // IBAN em falta em formandos com alguma rubrica elegível
  const iban = await (supabase as any)
    .from("fin_formando_rubricas")
    .select("formando_id, iban, elegivel")
    .eq("elegivel", true);
  const semIban = (iban.data ?? []).filter((r: any) => !r.iban);
  if (semIban.length) {
    alertas.push({
      id: "iban-formandos",
      nivel: "aviso",
      titulo: `${semIban.length} formando(s) com rubrica ativa e IBAN em falta`,
      href: "/formandos",
    });
  }

  return alertas;
}
