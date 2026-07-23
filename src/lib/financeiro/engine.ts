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

export type Rubrica = "BF" | "BFM" | "SA" | "TR" | "HN";

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
  totais: { BF: number; BFM: number; SA: number; TR: number; HN: number; geral: number };
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

  const [cfgRes, sessRes, inscRes, freqRes, bolsasRes, formadoresRes] = await Promise.all([
    supabase.from("fin_config").select("*").limit(1).maybeSingle(),
    supabase.from("sessoes")
      .select("id, data, horas, curso_ufcd_id, formador_id")
      .eq("curso_id", cursoId).gte("data", first).lte("data", last),
    supabase.from("curso_formandos")
      .select("id, formando_id, formando:formandos(id, nome)")
      .eq("curso_id", cursoId),
    supabase.from("curso_formando_ufcds").select("curso_formando_id, curso_ufcd_id, frequenta"),
    supabase.from("fin_bolsa_config").select("*"),
    supabase.from("formadores").select("id, nome, valor_hora"),
  ]);

  const cfg = cfgRes.data;
  if (!cfg) {
    avisos.push("Sem Configuração Financeira. Define os valores globais em Financeiro › Configuração.");
  }
  const horasMesRef = Number(cfg?.horas_mes_referencia ?? 150) || 150;
  const valorSa = Number(cfg?.valor_sa ?? 0);
  const valorKm = Number(cfg?.valor_km ?? 0);

  const sessoes = sessRes.data ?? [];
  const inscritos = inscRes.data ?? [];
  const freq = freqRes.data ?? [];
  const bolsas = bolsasRes.data ?? [];
  const formadores = formadoresRes.data ?? [];

  if (!sessoes.length) avisos.push(`Sem sessões neste curso entre ${first} e ${last}. Verifica o curso e o mês/ano escolhidos.`);
  if (!inscritos.length) avisos.push("Este curso não tem formandos inscritos.");
  if (!bolsas.length) avisos.push("Nenhum formando tem bolsa configurada (Financeiro › Formandos).");

  // Faltas do mês para estas inscrições
  const inscIds = inscritos.map(i => i.id);
  const { data: faltas } = inscIds.length
    ? await supabase.from("formando_faltas")
        .select("curso_formando_id, sessao_id, data, horas, tipo")
        .in("curso_formando_id", inscIds).gte("data", first).lte("data", last)
    : { data: [] as any[] };

  // Índices auxiliares — uma UC só conta para o formando se existir inscrição/frequenta=true.
  // Registos com frequenta=false são ausência e ficam fora do cálculo.
  const ucsByInsc = new Map<string, Set<string>>(); // inscricao -> Set(curso_ufcd inscritas/frequentadas)
  freq.forEach((f: any) => {
    if (f.frequenta === false) return;
    const s = ucsByInsc.get(f.curso_formando_id) ?? new Set<string>();
    s.add(f.curso_ufcd_id);
    ucsByInsc.set(f.curso_formando_id, s);
  });

  const bolsaByFormando = new Map<string, any>();
  bolsas.forEach((b: any) => bolsaByFormando.set(b.formando_id, b));

  const linhasFormandos: LinhaFormando[] = [];

  for (const insc of inscritos) {
    const formandoNome = (insc as any).formando?.nome ?? "—";
    const ucsInscritas = ucsByInsc.get(insc.id) ?? new Set<string>();

    // Sessões elegíveis: só as UC em que o formando está inscrito/frequenta.
    const minhasSess = sessoes.filter((s: any) => ucsInscritas.has(s.curso_ufcd_id));
    const horasPrevistas = minhasSess.reduce((a, s: any) => a + Number(s.horas || 0), 0);

    // Faltas registadas no cronograma descontam horas frequentadas.
    const minhasFaltas = (faltas ?? []).filter((f: any) => f.curso_formando_id === insc.id);
    const horasFalta = minhasFaltas.reduce((a: number, f: any) => a + Number(f.horas || 0), 0);
    const horasFreq = Math.max(0, horasPrevistas - horasFalta);

    // Dias = todos os dias do cronograma com formação atribuída nas UCs em que o formando está inscrito.
    // Faltas não reduzem o nº de dias — apenas descontam horas.
    const diasSet = new Set<string>();
    minhasSess.forEach((s: any) => diasSet.add(s.data));
    const diasPresenca = diasSet.size;

    // Dias elegíveis para SA: apenas dias com ≥ 3h efectivamente frequentadas
    // (horas do dia nas UCs inscritas/frequentadas menos faltas registadas nesse dia).
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
      if (efect >= 3) diasSa += 1;
      if (efect >= 1) diasTr += 1;
    });

    const bolsaCfg = bolsaByFormando.get(insc.formando_id);
    const tipoBolsa = bolsaCfg?.tipo as "BF" | "BFM" | "nenhuma" | undefined;
    const valorMensal = Number(bolsaCfg?.valor_mensal ?? 0);
    const elegSa = bolsaCfg?.elegivel_sa ?? true;
    const elegTr = bolsaCfg?.elegivel_tr ?? false;
    const kmDia = Number(bolsaCfg?.km_diario ?? 0);

    // Bolsa BF/BFM
    if (tipoBolsa === "BF" || tipoBolsa === "BFM") {
      const valor = +(valorMensal * (horasFreq / horasMesRef)).toFixed(2);
      linhasFormandos.push({
        formando_id: insc.formando_id, formando_nome: formandoNome,
        rubrica: tipoBolsa, horas_previstas: horasPrevistas, horas_frequentadas: horasFreq,
        horas_elegiveis: horasFreq, dias_elegiveis: diasPresenca, valor,
        memoria_calculo: { valor_mensal: valorMensal, horas_mes_ref: horasMesRef, formula: "valor_mensal × (horas_freq / horas_mes_ref)" },
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

    // TR — dias com ≥ 1h frequentada
    if (elegTr && kmDia > 0 && valorKm > 0 && diasTr > 0) {
      const km_total = +(diasTr * kmDia).toFixed(2);
      const valor = +(km_total * valorKm).toFixed(2);
      linhasFormandos.push({
        formando_id: insc.formando_id, formando_nome: formandoNome,
        rubrica: "TR", horas_previstas: horasPrevistas, horas_frequentadas: horasFreq,
        horas_elegiveis: horasFreq, dias_elegiveis: diasTr,
        km_total, valor,
        memoria_calculo: { km_dia: kmDia, dias: diasTr, valor_km: valorKm, regra: "dias com ≥ 1h frequentada", formula: "dias(≥1h) × km_dia × valor_km" },
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
