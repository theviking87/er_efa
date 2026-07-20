import type { ContextoProcessamento, Validacao } from "./types";
import type { HorasFormando } from "./horas";
import { regraAtiva } from "./contexto";

export function validar(
  ctx: ContextoProcessamento,
  horas: Map<string, HorasFormando>,
): Validacao[] {
  const out: Validacao[] = [];

  if (!ctx.configGlobal) {
    out.push({ nivel: "bloqueante", codigo: "CFG_GLOBAL", mensagem: "Configuração financeira global em falta." });
  }
  if (ctx.curso.estado === "arquivado" || ctx.curso.estado === "concluido") {
    out.push({ nivel: "aviso", codigo: "CURSO_ENCERRADO", mensagem: `Curso está ${ctx.curso.estado}.` });
  }
  if (ctx.sessoes.length === 0) {
    out.push({ nivel: "aviso", codigo: "SEM_SESSOES", mensagem: "Nenhuma sessão registada neste mês." });
  }
  if (ctx.sessoes.length > 0 && ctx.faltas.length === 0) {
    out.push({ nivel: "aviso", codigo: "SEM_FALTAS", mensagem: "Não existem faltas registadas — assumindo 100% de presença." });
  }

  // IBAN por formando com rubrica atribuída
  const rubIndex = new Map(ctx.rubricas.map((r) => [r.id, r]));
  ctx.atribuicoes.forEach((a) => {
    if (!a.elegivel) return;
    const rub = rubIndex.get(a.rubrica_id);
    if (!rub) return;
    if (!a.iban) {
      const f = ctx.formandos.find((x) => x.formando_id === a.formando_id);
      if (f) out.push({
        nivel: "bloqueante", codigo: "IBAN_FALTA",
        mensagem: `${f.nome}: IBAN em falta para rubrica ${rub.codigo}.`,
        ref: f.formando_id,
      });
    }
    const regra = regraAtiva(ctx, a.rubrica_id);
    if (!regra) {
      out.push({
        nivel: "bloqueante", codigo: "REGRA_INEXISTENTE",
        mensagem: `Rubrica ${rub.codigo} sem regra ativa no período.`,
        ref: rub.id,
      });
    }
  });

  // Horas negativas
  horas.forEach((h, fid) => {
    if (h.horas_frequentadas < 0) {
      out.push({
        nivel: "bloqueante", codigo: "HORAS_NEG",
        mensagem: `Horas frequentadas negativas para formando ${fid}.`,
        ref: fid,
      });
    }
  });

  return out;
}

export function bloqueantes(v: Validacao[]) {
  return v.filter((x) => x.nivel === "bloqueante");
}
