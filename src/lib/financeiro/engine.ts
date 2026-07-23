import { supabase } from "@/integrations/supabase/client";

/**
 * Motor de cálculo financeiro — mensal, por curso.
 *
 * Rubricas:
 *  - BF/BFM: bolsa mensal proporcional às horas frequentadas
 *      valor = bolsa_mensal * (horas_freq / horas_mes_referencia)
 *  - SA:     dias_presenca * valor_sa       (se elegivel_sa)
 *  - TR:     dias_presenca * km_diario * valor_km  (se elegivel_tr)
 *  - HN:     horas_ministradas * valor_hora do formador
 *
 * Regras de horas:
 *  - Só contam sessões em UCs em que o formando está inscrito/frequenta.
 *  - Faltas do mês (tipo != 'ausencia') descontam nas horas frequentadas.
 *  - Um "dia de presença" = dia com pelo menos uma sessão frequentada
 *    e sem falta que cubra toda a sessão desse dia (heurística: se somaram
 *    faltas >= horas do dia, não conta como presença).
 */

export type Rubrica = "BF" | "BFM" | "SA" | "TR" | "HN" | "ATL";

export type LinhaFormando = {
  formando_id: string;
  formando_nome: string;
  rubrica: Rubrica;
  horas_previstas: number;
  horas_frequentadas: number;
  horas_elegiveis: number;
  dias_elegiveis: number;
  valor_hora?: number;
  valor_dia?: number;
  km_total?: number;
  valor: number;
  memoria_calculo: Record<string, unknown>;
};

export type LinhaFormador = {
  formador_id: string;
  formador_nome: string;
  rubrica: "HN";
  horas_frequentadas: number;
  valor_hora: number;
  valor: number;
  memoria_calculo: Record<string, unknown>;
};

export type Preview = {
  curso_id: string;
  ano: number;
  mes: number;
  formandos: LinhaFormando[];
  formadores: LinhaFormador[];
  totais: { BF: number; BFM: number; SA: number; TR: number; HN: number; ATL: number; geral: number };
  avisos: string[];
};

function firstLastDay(ano: number, mes: number) {
  const first = new Date(Date.UTC(ano, mes - 1, 1)).toISOString().slice(0, 10);
  const last = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
  return { first, last };
}

export async function calcularProcessamento(cursoId: string, ano: number, mes: number): Promise<Preview> {
  const avisos: string[] = [];
  const { first, last } = firstLastDay(ano, mes);

  const [cfgRes, sessRes, inscRes, formadoresRes] = await Promise.all([
    supabase.from("fin_config").select("*").limit(1).maybeSingle(),
    supabase.from("sessoes")
      .select("id, data, horas, curso_ufcd_id, formador_id")
      .eq("curso_id", cursoId).gte("data", first).lte("data", last),
    supabase.from("curso_formandos")
      .select("id, formando_id, formando:formandos(id, nome)")
      .eq("curso_id", cursoId),
    supabase.from("formadores").select("id, nome, valor_hora"),
  ]);

  if (cfgRes.error) throw cfgRes.error;
  if (sessRes.error) throw sessRes.error;
  if (inscRes.error) throw inscRes.error;
  if (formadoresRes.error) throw formadoresRes.error;

  const cfg = cfgRes.data;
  if (!cfg) {
    avisos.push("Sem Configuração Financeira. Define os valores globais em Financeiro › Configuração.");
  }
  const horasMesRef = Number(cfg?.horas_mes_referencia ?? 150) || 150;
  const valorSa = Number(cfg?.valor_sa ?? 0);
  const valorKm = Number(cfg?.valor_km ?? 0);
  const limiteKmDia = Number((cfg as any)?.limite_km_dia ?? 0);
  const trTetoMensal = Number((cfg as any)?.tr_teto_mensal ?? 0);
  const atlTetoMensal = Number((cfg as any)?.atl_teto_mensal ?? 0);

  const sessoes = sessRes.data ?? [];
  const inscritos = inscRes.data ?? [];
  const formadores = formadoresRes.data ?? [];

  const inscIds = inscritos.map(i => i.id);
  const formandoIds = inscritos.map(i => i.formando_id).filter(Boolean);

  // Importante: não carregar todas as inscrições UC da base de dados.
  // O cliente limita resultados por defeito e os formandos criados mais tarde
  // podiam ficar fora do cálculo. Aqui só buscamos as UCs dos inscritos neste curso.
  let freq: any[] = [];
  if (inscIds.length) {
    const { data, error } = await supabase.from("curso_formando_ufcds")
      .select("curso_formando_id, curso_ufcd_id, frequenta")
      .in("curso_formando_id", inscIds)
      .range(0, 9999);
    if (error) throw error;
    freq = data ?? [];
  }

  let bolsas: any[] = [];
  if (formandoIds.length) {
    const { data, error } = await supabase.from("fin_bolsa_config")
      .select("*")
      .in("formando_id", formandoIds)
      .range(0, 9999);
    if (error) throw error;
    bolsas = data ?? [];
  }

  if (!sessoes.length) avisos.push(`Sem sessões neste curso entre ${first} e ${last}. Verifica o curso e o mês/ano escolhidos.`);
  if (!inscritos.length) avisos.push("Este curso não tem formandos inscritos.");
  if (!bolsas.length) avisos.push("Nenhum formando tem bolsa configurada (Financeiro › Formandos).");

  // Faltas do mês para estas inscrições
  const { data: faltas } = inscIds.length
    ? await supabase.from("formando_faltas")
        .select("curso_formando_id, sessao_id, data, horas, tipo")
        .in("curso_formando_id", inscIds).gte("data", first).lte("data", last)
    : { data: [] as any[] };

  // Presença por defeito:
  //  · frequenta=false → ausência explícita nessa UC (fica fora).
  //  · frequenta=true  → inscrito nessa UC.
  //  · sem qualquer linha → assume-se inscrito em TODAS as UCs do curso
  //    (evita ignorar formandos recém-adicionados sem seleção manual).
  const ucsCurso = new Set<string>(sessoes.map((s: any) => s.curso_ufcd_id).filter(Boolean));
  const inscHasRows = new Set<string>();
  const ucsByInsc = new Map<string, Set<string>>();
  const ausentesByInsc = new Map<string, Set<string>>();
  freq.forEach((f: any) => {
    inscHasRows.add(f.curso_formando_id);
    if (f.frequenta === false) {
      const s = ausentesByInsc.get(f.curso_formando_id) ?? new Set<string>();
      s.add(f.curso_ufcd_id); ausentesByInsc.set(f.curso_formando_id, s);
      return;
    }
    const s = ucsByInsc.get(f.curso_formando_id) ?? new Set<string>();
    s.add(f.curso_ufcd_id);
    ucsByInsc.set(f.curso_formando_id, s);
  });

  const bolsaByFormando = new Map<string, any>();
  bolsas.forEach((b: any) => bolsaByFormando.set(b.formando_id, b));

  const linhasFormandos: LinhaFormando[] = [];

  for (const insc of inscritos) {
    const formandoNome = (insc as any).formando?.nome ?? "—";
    const ausentes = ausentesByInsc.get(insc.id) ?? new Set<string>();
    const ucsInscritas = inscHasRows.has(insc.id)
      ? (ucsByInsc.get(insc.id) ?? new Set<string>())
      : new Set<string>([...ucsCurso].filter(u => !ausentes.has(u)));

    // Sessões elegíveis: só as UC em que o formando está inscrito/frequenta.
    const minhasSess = sessoes.filter((s: any) => ucsInscritas.has(s.curso_ufcd_id));
    const horasPrevistas = minhasSess.reduce((a, s: any) => a + Number(s.horas || 0), 0);

    // Faltas registadas no cronograma:
    //  · injustificadas descontam horas frequentadas (bolsa/honorários).
    //  · justificadas NÃO descontam horas — apenas contam para o SA diário.
    const minhasFaltas = (faltas ?? []).filter((f: any) => f.curso_formando_id === insc.id);
    const horasFaltaInjust = minhasFaltas
      .filter((f: any) => f.tipo !== "justificada")
      .reduce((a: number, f: any) => a + Number(f.horas || 0), 0);
    const horasFreq = Math.max(0, horasPrevistas - horasFaltaInjust);

    // Dias = todos os dias do cronograma com formação atribuída nas UCs em que o formando está inscrito.
    const diasSet = new Set<string>();
    minhasSess.forEach((s: any) => diasSet.add(s.data));
    const diasPresenca = diasSet.size;

    // Dias elegíveis para SA: dias com ≥ 3h efectivamente frequentadas.
    // Para o SA contam TODAS as faltas do dia (justificadas + injustificadas):
    // uma falta justificada mantém as horas para bolsa, mas se a formação
    // efectiva desse dia ficar abaixo de 3h, o SA não é pago.
    const horasPorDia = new Map<string, number>();
    minhasSess.forEach((s: any) => {
      horasPorDia.set(s.data, (horasPorDia.get(s.data) ?? 0) + Number(s.horas || 0));
    });
    const faltasPorDia = new Map<string, number>();
    minhasFaltas.forEach((f: any) => {
      faltasPorDia.set(f.data, (faltasPorDia.get(f.data) ?? 0) + Number(f.horas || 0));
    });
    let diasSa = 0;
    let diasTr = 0;
    horasPorDia.forEach((h, dia) => {
      const efect = Math.max(0, h - (faltasPorDia.get(dia) ?? 0));
      // SA e TR partilham o mesmo critério: dia só conta se ≥ 3h efectivas.
      // Se o dia perde SA, também perde TR.
      if (efect >= 3) { diasSa += 1; diasTr += 1; }
    });

    const bolsaCfg = bolsaByFormando.get(insc.formando_id);
    const tipoBolsa = bolsaCfg?.tipo as "BF" | "BFM" | "nenhuma" | undefined;
    const valorMensal = Number(bolsaCfg?.valor_mensal ?? 0);
    const elegSa = bolsaCfg?.elegivel_sa ?? true;
    const elegTr = bolsaCfg?.elegivel_tr ?? false;
    const kmDia = Number(bolsaCfg?.km_diario ?? 0);

    // Bolsa BF/BFM — valor/hora = valor_mensal / horas_mes_ref; total = valor/hora × horas_freq
    if (tipoBolsa === "BF" || tipoBolsa === "BFM") {
      const valorHora = horasMesRef > 0 ? +(valorMensal / horasMesRef).toFixed(4) : 0;
      const valor = +(valorHora * horasFreq).toFixed(2);
      linhasFormandos.push({
        formando_id: insc.formando_id, formando_nome: formandoNome,
        rubrica: tipoBolsa, horas_previstas: horasPrevistas, horas_frequentadas: horasFreq,
        horas_elegiveis: horasFreq, dias_elegiveis: diasPresenca,
        valor_hora: valorHora, valor,
        memoria_calculo: { valor_mensal: valorMensal, horas_mes_ref: horasMesRef, valor_hora: valorHora, horas_freq: horasFreq, formula: "(valor_mensal / horas_mes_ref) × horas_freq" },
      });
    }

    // SA — só dias com ≥ 3h frequentadas
    if (elegSa && valorSa > 0 && diasSa > 0) {
      const valor = +(diasSa * valorSa).toFixed(2);
      linhasFormandos.push({
        formando_id: insc.formando_id, formando_nome: formandoNome,
        rubrica: "SA", horas_previstas: horasPrevistas, horas_frequentadas: horasFreq,
        horas_elegiveis: horasFreq, dias_elegiveis: diasSa,
        valor_dia: valorSa, valor,
        memoria_calculo: { valor_dia: valorSa, dias: diasSa, regra: "dias com ≥ 3h frequentadas", formula: "dias(≥3h) × valor_sa" },
      });
    }

    // TR — dias com ≥ 1h frequentada; km/dia limitado; tecto mensal global.
    if (elegTr && kmDia > 0 && valorKm > 0 && diasTr > 0) {
      const kmDiaAplicado = limiteKmDia > 0 ? Math.min(kmDia, limiteKmDia) : kmDia;
      const km_total = +(diasTr * kmDiaAplicado).toFixed(2);
      const bruto = +(km_total * valorKm).toFixed(2);
      const valor = trTetoMensal > 0 ? +Math.min(bruto, trTetoMensal).toFixed(2) : bruto;
      linhasFormandos.push({
        formando_id: insc.formando_id, formando_nome: formandoNome,
        rubrica: "TR", horas_previstas: horasPrevistas, horas_frequentadas: horasFreq,
        horas_elegiveis: horasFreq, dias_elegiveis: diasTr,
        km_total, valor,
        memoria_calculo: { km_dia: kmDia, km_dia_aplicado: kmDiaAplicado, limite_km_dia: limiteKmDia || null, dias: diasTr, valor_km: valorKm, bruto, teto_mensal: trTetoMensal || null, aplicado_teto: trTetoMensal > 0 && bruto > trTetoMensal, regra: "dias com ≥ 3h efectivas (mesmo critério do SA); km/dia limitado pela Configuração; aplicado tecto mensal global se definido", formula: "min(dias(≥3h) × min(km_dia, limite_km_dia) × valor_km, tr_teto_mensal)" },
      });
    }
    // ATL — valor mensal por formando, com tecto global (se definido)
    const valorAtlFormando = Number(bolsaCfg?.valor_atl ?? 0);
    if (valorAtlFormando > 0) {
      const valor = atlTetoMensal > 0 ? +Math.min(valorAtlFormando, atlTetoMensal).toFixed(2) : +valorAtlFormando.toFixed(2);
      linhasFormandos.push({
        formando_id: insc.formando_id, formando_nome: formandoNome,
        rubrica: "ATL", horas_previstas: horasPrevistas, horas_frequentadas: horasFreq,
        horas_elegiveis: horasFreq, dias_elegiveis: diasPresenca,
        valor,
        memoria_calculo: { valor_formando: valorAtlFormando, teto_mensal: atlTetoMensal || null, aplicado_teto: atlTetoMensal > 0 && valorAtlFormando > atlTetoMensal, regra: "valor mensal fixo por formando, limitado pelo tecto global", formula: "min(valor_atl, atl_teto_mensal)" },
      });
    }

  }



  // Honorários por formador — soma horas de sessões do mês por formador
  const horasPorFormador = new Map<string, number>();
  sessoes.forEach((s: any) => {
    if (!s.formador_id) return;
    horasPorFormador.set(s.formador_id, (horasPorFormador.get(s.formador_id) ?? 0) + Number(s.horas || 0));
  });
  const linhasFormadores: LinhaFormador[] = [];
  horasPorFormador.forEach((h, formador_id) => {
    const f = formadores.find((x: any) => x.id === formador_id);
    const vHora = Number(f?.valor_hora ?? 0);
    if (!f) return;
    if (vHora <= 0) avisos.push(`Formador "${f.nome}" sem valor/hora definido.`);
    const valor = +(h * vHora).toFixed(2);
    linhasFormadores.push({
      formador_id, formador_nome: f.nome,
      rubrica: "HN", horas_frequentadas: h, valor_hora: vHora, valor,
      memoria_calculo: { horas: h, valor_hora: vHora, formula: "horas × valor_hora" },
    });
  });

  const totais = { BF: 0, BFM: 0, SA: 0, TR: 0, HN: 0, geral: 0 };
  linhasFormandos.forEach(l => { totais[l.rubrica] += l.valor; totais.geral += l.valor; });
  linhasFormadores.forEach(l => { totais.HN += l.valor; totais.geral += l.valor; });
  (Object.keys(totais) as (keyof typeof totais)[]).forEach(k => (totais[k] = +totais[k].toFixed(2)));

  return { curso_id: cursoId, ano, mes, formandos: linhasFormandos, formadores: linhasFormadores, totais, avisos };
}

export async function guardarProcessamento(preview: Preview, projetoId: string | null) {
  // Se já existe (curso+ano+mes) reutiliza; senão cria.
  const { data: existente } = await supabase.from("fin_processamento")
    .select("id, estado")
    .eq("curso_id", preview.curso_id).eq("ano", preview.ano).eq("mes", preview.mes)
    .maybeSingle();

  let processamentoId = existente?.id as string | undefined;
  const payload = {
    projeto_id: projetoId, curso_id: preview.curso_id, ano: preview.ano, mes: preview.mes,
    estado: "rascunho",
    total_bf: preview.totais.BF, total_bfm: preview.totais.BFM,
    total_sa: preview.totais.SA, total_tr: preview.totais.TR,
    total_hn: preview.totais.HN, total_geral: preview.totais.geral,
  };
  if (processamentoId) {
    if (existente?.estado === "fechado") throw new Error("Processamento fechado — não pode ser recalculado.");
    const { error } = await supabase.from("fin_processamento").update(payload as never).eq("id", processamentoId);
    if (error) throw error;
    await supabase.from("fin_processamento_linha").delete().eq("processamento_id", processamentoId);
  } else {
    const { data, error } = await supabase.from("fin_processamento").insert(payload as never).select("id").single();
    if (error) throw error;
    processamentoId = (data as any).id;
  }

  const linhas = [
    ...preview.formandos.map(l => ({
      processamento_id: processamentoId, formando_id: l.formando_id, rubrica: l.rubrica,
      horas_previstas: l.horas_previstas, horas_frequentadas: l.horas_frequentadas,
      horas_elegiveis: l.horas_elegiveis, dias_elegiveis: l.dias_elegiveis,
      valor_hora: l.valor_hora ?? null,
      valor_dia: l.valor_dia ?? null, km_total: l.km_total ?? null, valor: l.valor,
      memoria_calculo: l.memoria_calculo,
    })),
    ...preview.formadores.map(l => ({
      processamento_id: processamentoId, formador_id: l.formador_id, rubrica: l.rubrica,
      horas_frequentadas: l.horas_frequentadas, valor_hora: l.valor_hora, valor: l.valor,
      memoria_calculo: l.memoria_calculo,
    })),
  ];
  if (linhas.length) {
    const { error } = await supabase.from("fin_processamento_linha").insert(linhas as never);
    if (error) throw error;
  }
  return processamentoId!;
}
