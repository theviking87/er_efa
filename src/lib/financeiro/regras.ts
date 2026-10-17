/**
 * Regras puras (sem acesso à base de dados) do módulo financeiro e de
 * assiduidade EFA. Usadas pelo motor, pela ficha do formando e pelos testes.
 */

export type EstadoSessao = "realizada" | "cancelada" | "nao_realizada" | "reagendada";

export const ESTADOS_SESSAO: { value: EstadoSessao; label: string }[] = [
  { value: "realizada", label: "Realizada" },
  { value: "cancelada", label: "Cancelada" },
  { value: "nao_realizada", label: "Não realizada" },
  { value: "reagendada", label: "Reagendada (substituída)" },
];

/** Só sessões realizadas contam para bolsas, subsídios, honorários e assiduidade. */
export function sessaoElegivel(s: { estado?: string | null }): boolean {
  return !s.estado || s.estado === "realizada";
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Horas efetivamente frequentadas; online é um marcador, mesmo com 0h registadas. */
export function horasFrequenciaSessao(horas: number, registos: { tipo: string; horas: number }[]) {
  const total = Math.max(0, Number(horas) || 0);
  const faltas = registos.filter(f => ["justificada", "injustificada", "ausencia"].includes(f.tipo))
    .reduce((s, f) => s + Math.max(0, Number(f.horas) || 0), 0);
  const frequentadas = Math.max(0, total - faltas);
  const online = registos.some(f => f.tipo === "online") ? frequentadas : 0;
  return { frequentadas: r2(frequentadas), presenciais: r2(frequentadas - online), online: r2(online) };
}

/** Percurso individual: sem seleção explícita, frequenta todas as disciplinas. */
export function disciplinasFrequentadas(ids: string[], selecao: { curso_ufcd_id: string; frequenta: boolean }[]) {
  if (!selecao.length) return new Set(ids);
  return new Set(selecao.filter(s => s.frequenta && ids.includes(s.curso_ufcd_id)).map(s => s.curso_ufcd_id));
}

/** A frequência histórica termina na desistência/conclusão desta inscrição, não de outros cursos. */
export function sessaoNoPercurso(s: { estado: string; data: string }, i: {
  data_inscricao: string; data_desistencia: string | null; data_conclusao: string | null;
}, ate: string) {
  return s.estado === "realizada" && s.data <= ate && s.data >= i.data_inscricao
    && (!i.data_desistencia || s.data < i.data_desistencia)
    && (!i.data_conclusao || s.data <= i.data_conclusao);
}

// ---------------------------------------------------------------------------
// Limite acumulado de faltas justificadas pagáveis (bolsa)
// ---------------------------------------------------------------------------
export function limiteFaltasJustificadas(p: {
  horasPercurso: number;
  percentagem: number; // ex.: 10
  justificadasAnteriores: number; // horas justificadas em meses anteriores do curso
  justificadasMes: number;
}) {
  const limite = r2((p.horasPercurso * p.percentagem) / 100);
  const consumidoAntes = Math.min(p.justificadasAnteriores, limite);
  const disponivel = Math.max(0, limite - consumidoAntes);
  const pagaveisMes = Math.min(p.justificadasMes, disponivel);
  const excedenteMes = r2(p.justificadasMes - pagaveisMes);
  return {
    limite,
    consumidoAntes: r2(consumidoAntes),
    pagaveisMes: r2(pagaveisMes),
    excedenteMes,
    restante: r2(disponivel - pagaveisMes),
  };
}

// ---------------------------------------------------------------------------
// Dias elegíveis para SA / TR (um dia conta uma vez, independentemente do nº de sessões)
// ---------------------------------------------------------------------------
export function diasSubsidios(p: {
  horasPorDia: Map<string, number>; // horas de sessões realizadas por dia
  faltasPorDia: Map<string, number>; // horas de falta (just. + injust.) por dia
  diasOnline: Set<string>;
  limiarHoras: number;
}) {
  let diasSa = 0;
  let diasTr = 0;
  let diasTrExcluidosOnline = 0;
  p.horasPorDia.forEach((h, dia) => {
    const efect = Math.max(0, h - (p.faltasPorDia.get(dia) ?? 0));
    if (efect + 1e-9 >= p.limiarHoras) {
      diasSa += 1;
      if (p.diasOnline.has(dia)) diasTrExcluidosOnline += 1;
      else diasTr += 1;
    }
  });
  return { diasSa, diasTr, diasTrExcluidosOnline };
}

// ---------------------------------------------------------------------------
// Assiduidade EFA: 90% global, 50% por UC/UFCD
// ---------------------------------------------------------------------------
export type AssidUc = {
  curso_ufcd_id: string;
  nome: string;
  horasDadas: number;
  faltasJust: number;
  faltasInjust: number;
  recuperadas: number;
  presenca: number;
  pct: number; // 0..100
  cumpre50: boolean;
};

export function calcularAssiduidade(p: {
  ucs: { curso_ufcd_id: string; nome: string }[];
  sessoes: { id: string; curso_ufcd_id: string; horas: number; estado?: string | null }[];
  faltas: { sessao_id: string | null; horas: number; tipo: string }[];
  recuperadasPorUc?: Map<string, number>;
  limiteGlobal?: number; // 90
  limiteUc?: number; // 50
  alertaAmarelo?: number; // 8 (% faltas)
  alertaVermelho?: number; // 10
}) {
  const limG = p.limiteGlobal ?? 90;
  const limU = p.limiteUc ?? 50;
  const sessOk = p.sessoes.filter(sessaoElegivel);
  const ucBySess = new Map(sessOk.map((s) => [s.id, s.curso_ufcd_id]));
  const porUc: AssidUc[] = p.ucs.map((u) => {
    const horasDadas = sessOk.filter((s) => s.curso_ufcd_id === u.curso_ufcd_id).reduce((a, s) => a + Number(s.horas || 0), 0);
    let fj = 0, fi = 0;
    for (const f of p.faltas) {
      if (!f.sessao_id || ucBySess.get(f.sessao_id) !== u.curso_ufcd_id) continue;
      if (f.tipo === "justificada") fj += Number(f.horas || 0);
      else if (f.tipo === "injustificada" || f.tipo === "ausencia") fi += Number(f.horas || 0);
      // online = presença
    }
    const rec = Math.min(p.recuperadasPorUc?.get(u.curso_ufcd_id) ?? 0, fj + fi);
    const presenca = Math.max(0, horasDadas - fj - fi + rec);
    const pct = horasDadas > 0 ? r2((presenca / horasDadas) * 100) : 100;
    return { curso_ufcd_id: u.curso_ufcd_id, nome: u.nome, horasDadas: r2(horasDadas), faltasJust: r2(fj), faltasInjust: r2(fi), recuperadas: r2(rec), presenca: r2(presenca), pct, cumpre50: horasDadas === 0 || pct >= limU };
  });
  const tot = porUc.reduce((a, u) => ({ d: a.d + u.horasDadas, p: a.p + u.presenca, fj: a.fj + u.faltasJust, fi: a.fi + u.faltasInjust, r: a.r + u.recuperadas }), { d: 0, p: 0, fj: 0, fi: 0, r: 0 });
  const pctGlobal = tot.d > 0 ? r2((tot.p / tot.d) * 100) : 100;
  const pctFaltas = r2(100 - pctGlobal);
  const alerta: "ok" | "amarelo" | "vermelho" = pctFaltas >= (p.alertaVermelho ?? 10) ? "vermelho" : pctFaltas >= (p.alertaAmarelo ?? 8) ? "amarelo" : "ok";
  const cumpre90 = pctGlobal >= limG;
  const ucsEmFalha = porUc.filter((u) => !u.cumpre50);
  return {
    horasDadas: r2(tot.d), presenca: r2(tot.p), faltasJust: r2(tot.fj), faltasInjust: r2(tot.fi), recuperadas: r2(tot.r),
    pctGlobal, cumpre90, porUc, ucsEmFalha, alerta,
    requerAnalise: !cumpre90 || ucsEmFalha.length > 0,
  };
}
