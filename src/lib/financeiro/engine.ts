import { supabase } from "@/integrations/supabase/client";

/**
 * Motor de cálculo financeiro — mensal, por curso.
 *
 * Rubricas:
 *  - BF/BFM: bolsa proporcional às horas, limitada ao valor mensal da ficha (tecto)
 *      valor = min(bolsa_mensal * (horas_freq / horas_mes_referencia), bolsa_mensal)
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
      .select("id, formando_id, data_desistencia, data_conclusao, formando:formandos(id, nome)")
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

  // Histórico de configuração de transporte (km ou passe) por formando.
  // Vale o registo mais recente com vigente_desde <= último dia do mês processado.
  let transportes: any[] = [];
  if (formandoIds.length) {
    const { data, error } = await supabase.from("fin_transporte_config")
      .select("*")
      .in("formando_id", formandoIds)
      .lte("vigente_desde", last)
      .order("vigente_desde", { ascending: true })
      .range(0, 9999);
    if (error) throw error;
    transportes = data ?? [];
  }
  const transporteByFormando = new Map<string, any>();
  transportes.forEach((t: any) => transporteByFormando.set(t.formando_id, t)); // ordenado asc → fica o mais recente


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

    // Data limite da inscrição: min(desistência, conclusão). Sessões e faltas
    // posteriores a esta data não contam para este formando neste curso.
    const dDes = (insc as any).data_desistencia as string | null | undefined;
    const dCon = (insc as any).data_conclusao as string | null | undefined;
    const dataLimite = [dDes, dCon].filter(Boolean).sort()[0] as string | undefined;

    // Se a desistência/conclusão ocorreu antes do mês processado, o formando
    // não entra de todo neste processamento (nem sequer com linhas a zero).
    if (dataLimite && dataLimite < first) continue;

    // Sessões elegíveis: só as UC em que o formando está inscrito/frequenta.
    const minhasSess = sessoes
      .filter((s: any) => ucsInscritas.has(s.curso_ufcd_id))
      .filter((s: any) => !dataLimite || s.data <= dataLimite);
    const horasPrevistas = minhasSess.reduce((a, s: any) => a + Number(s.horas || 0), 0);

    // Faltas registadas no cronograma:
    //  · injustificadas descontam horas frequentadas (bolsa/honorários).
    //  · justificadas NÃO descontam horas — apenas contam para o SA diário.
    //  · online = formando em sessão remota; não é falta, não desconta horas
    //    nem SA, mas retira o direito a TR nesse dia.
    const minhasFaltas = (faltas ?? [])
      .filter((f: any) => f.curso_formando_id === insc.id)
      .filter((f: any) => !dataLimite || f.data <= dataLimite);
    const horasFaltaInjust = minhasFaltas
      .filter((f: any) => f.tipo !== "justificada" && f.tipo !== "online")
      .reduce((a: number, f: any) => a + Number(f.horas || 0), 0);
    const horasFreq = Math.max(0, horasPrevistas - horasFaltaInjust);

    // Dias = todos os dias do cronograma com formação atribuída nas UCs em que o formando está inscrito.
    const diasSet = new Set<string>();
    minhasSess.forEach((s: any) => diasSet.add(s.data));
    const diasPresenca = diasSet.size;

    // Dias em que o formando teve pelo menos uma sessão marcada como online → sem TR.
    const diasOnline = new Set<string>(
      minhasFaltas.filter((f: any) => f.tipo === "online").map((f: any) => f.data),
    );

    // Dias elegíveis para SA: dias com ≥ 3h efectivamente frequentadas.
    // Para o SA contam TODAS as faltas do dia (justificadas + injustificadas):
    // uma falta justificada mantém as horas para bolsa, mas se a formação
    // efectiva desse dia ficar abaixo de 3h, o SA não é pago. Sessões online
    // contam para o SA (o formando esteve em formação, ainda que remota).
    const horasPorDia = new Map<string, number>();
    minhasSess.forEach((s: any) => {
      horasPorDia.set(s.data, (horasPorDia.get(s.data) ?? 0) + Number(s.horas || 0));
    });
    const faltasPorDia = new Map<string, number>();
    minhasFaltas.forEach((f: any) => {
      if (f.tipo === "online") return; // online não é falta
      faltasPorDia.set(f.data, (faltasPorDia.get(f.data) ?? 0) + Number(f.horas || 0));
    });
    let diasSa = 0;
    let diasTr = 0;
    let diasTrExcluidosOnline = 0;
    horasPorDia.forEach((h, dia) => {
      const efect = Math.max(0, h - (faltasPorDia.get(dia) ?? 0));
      // SA e TR partilham o critério de ≥ 3h efectivas. Além disso, TR é
      // retirado nos dias em que o formando teve sessão online.
      if (efect >= 3) {
        diasSa += 1;
        if (diasOnline.has(dia)) diasTrExcluidosOnline += 1;
        else diasTr += 1;
      }
    });

    const bolsaCfg = bolsaByFormando.get(insc.formando_id);
    const tipoBolsa = bolsaCfg?.tipo as "BF" | "BFM" | "nenhuma" | undefined;
    const valorMensal = Number(bolsaCfg?.valor_mensal ?? 0);
    const elegSa = bolsaCfg?.elegivel_sa ?? true;
    const elegTr = bolsaCfg?.elegivel_tr ?? false;
    const trCfg = transporteByFormando.get(insc.formando_id);
    const modoTr: "km" | "passe" = (trCfg?.modo === "passe" ? "passe" : "km");
    const kmDia = Number(trCfg ? trCfg.km_diario ?? 0 : bolsaCfg?.km_diario ?? 0);
    const valorPasse = Number(trCfg?.valor_passe ?? 0);
    const trDesde: string | null = trCfg?.vigente_desde ?? null;


    // Bolsa BF/BFM — proporcional às horas, com tecto no valor mensal da ficha
    if (tipoBolsa === "BF" || tipoBolsa === "BFM") {
      const taxa = horasMesRef > 0 ? valorMensal / horasMesRef : 0;
      const valorHora = +taxa.toFixed(4);
      // usa a taxa sem arredondar para evitar perdas de cêntimos
      const bruto = +(taxa * horasFreq).toFixed(2);
      const valor = valorMensal > 0 ? Math.min(bruto, valorMensal) : bruto;
      linhasFormandos.push({
        formando_id: insc.formando_id, formando_nome: formandoNome,
        rubrica: tipoBolsa, horas_previstas: horasPrevistas, horas_frequentadas: horasFreq,
        horas_elegiveis: horasFreq, dias_elegiveis: diasPresenca,
        valor_hora: valorHora, valor,
        memoria_calculo: {
          valor_mensal: valorMensal, horas_mes_ref: horasMesRef, valor_hora: valorHora,
          horas_freq: horasFreq, valor_bruto: bruto, tecto_mensal: valorMensal,
          limitado_pelo_tecto: valorMensal > 0 && bruto > valorMensal,
          formula: "min((valor_mensal / horas_mes_ref) × horas_freq, valor_mensal)",
        },
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

    // TR — dias com ≥ 3h efectivas, excluindo dias online.
    //   modo "km":    dias × min(km_dia, limite) × valor_km
    //   modo "passe": valor fixo do passe se houver pelo menos 1 dia elegível
    // A configuração usada é a que estiver em vigor no mês (fin_transporte_config.vigente_desde).
    const notaOnline = diasTrExcluidosOnline > 0
      ? `Formando com ${diasTrExcluidosOnline} dia(s) em sessão online — TR não pago nesses dias.`
      : undefined;

    if (elegTr && modoTr === "passe" && valorPasse > 0) {
      const bruto = diasTr > 0 ? +valorPasse.toFixed(2) : 0;
      const valor = trTetoMensal > 0 ? +Math.min(bruto, trTetoMensal).toFixed(2) : bruto;
      linhasFormandos.push({
        formando_id: insc.formando_id, formando_nome: formandoNome,
        rubrica: "TR", horas_previstas: horasPrevistas, horas_frequentadas: horasFreq,
        horas_elegiveis: horasFreq, dias_elegiveis: diasTr,
        km_total: 0, valor,
        memoria_calculo: {
          modo: "passe", valor_passe: valorPasse, vigente_desde: trDesde, dias: diasTr,
          dias_online_excluidos: diasTrExcluidosOnline, bruto,
          teto_mensal: trTetoMensal || null, aplicado_teto: trTetoMensal > 0 && bruto > trTetoMensal,
          nota: diasTr > 0 ? notaOnline : "Sem dias presenciais elegíveis — passe não pago.",
          regra: "passe mensal pago se existir pelo menos 1 dia presencial com ≥ 3h efectivas; vigora a partir da data de início da configuração de transporte",
          formula: "min(valor_passe, tr_teto_mensal)",
        },
      });
    } else if (elegTr && modoTr === "km" && kmDia > 0 && valorKm > 0 && diasTr > 0) {
      const kmDiaAplicado = limiteKmDia > 0 ? Math.min(kmDia, limiteKmDia) : kmDia;
      const km_total = +(diasTr * kmDiaAplicado).toFixed(2);
      const bruto = +(km_total * valorKm).toFixed(2);
      const valor = trTetoMensal > 0 ? +Math.min(bruto, trTetoMensal).toFixed(2) : bruto;
      linhasFormandos.push({
        formando_id: insc.formando_id, formando_nome: formandoNome,
        rubrica: "TR", horas_previstas: horasPrevistas, horas_frequentadas: horasFreq,
        horas_elegiveis: horasFreq, dias_elegiveis: diasTr,
        km_total, valor,
        memoria_calculo: { modo: "km", vigente_desde: trDesde, km_dia: kmDia, km_dia_aplicado: kmDiaAplicado, limite_km_dia: limiteKmDia || null, dias: diasTr, dias_online_excluidos: diasTrExcluidosOnline, valor_km: valorKm, bruto, teto_mensal: trTetoMensal || null, aplicado_teto: trTetoMensal > 0 && bruto > trTetoMensal, nota: notaOnline, regra: "dias com ≥ 3h efectivas, excluindo dias em sessão online; km/dia limitado pela Configuração; aplicado tecto mensal global se definido", formula: "min(dias(≥3h, presenciais) × min(km_dia, limite_km_dia) × valor_km, tr_teto_mensal)" },
      });
    } else if (elegTr && modoTr === "km" && kmDia > 0 && valorKm > 0 && diasTrExcluidosOnline > 0) {
      // Todos os dias elegíveis foram online — regista linha zero com nota explicativa.
      linhasFormandos.push({
        formando_id: insc.formando_id, formando_nome: formandoNome,
        rubrica: "TR", horas_previstas: horasPrevistas, horas_frequentadas: horasFreq,
        horas_elegiveis: horasFreq, dias_elegiveis: 0,
        km_total: 0, valor: 0,
        memoria_calculo: { modo: "km", km_dia: kmDia, dias: 0, dias_online_excluidos: diasTrExcluidosOnline, valor_km: valorKm, valor: 0, nota: `Todos os dias elegíveis (${diasTrExcluidosOnline}) foram em sessão online — sem TR.`, regra: "TR não pago em dias de sessão online" },
      });
    }

    // ATL — apenas cria a linha se o formando estiver marcado como elegível.
    // O valor mensal é definido manualmente no ecrã do processamento.
    const elegAtl = Boolean((bolsaCfg as any)?.elegivel_atl ?? false);
    if (elegAtl) {
      linhasFormandos.push({
        formando_id: insc.formando_id, formando_nome: formandoNome,
        rubrica: "ATL", horas_previstas: horasPrevistas, horas_frequentadas: horasFreq,
        horas_elegiveis: horasFreq, dias_elegiveis: diasPresenca,
        valor: 0,
        memoria_calculo: { regra: "valor mensal definido manualmente no processamento", teto_mensal: atlTetoMensal || null },
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

  const totais = { BF: 0, BFM: 0, SA: 0, TR: 0, HN: 0, ATL: 0, geral: 0 };
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

  // Preservar valores manuais de ATL já introduzidos no processamento anterior.
  const manuaisFormando = new Map<string, number>();   // `${formando_id}|${rubrica}` -> valor_manual
  const recibosFormador = new Map<string, boolean>();  // formador_id -> recibo_confirmado
  let totalOutros = 0;                                 // linhas manuais (rubrica OUT) — nunca recalculadas
  if (processamentoId) {
    const { data: antigas } = await supabase.from("fin_processamento_linha")
      .select("formando_id, formador_id, rubrica, valor, valor_manual, recibo_confirmado")
      .eq("processamento_id", processamentoId);
    const mapAtl = new Map<string, number>();
    (antigas ?? []).forEach((l: any) => {
      if (l.formando_id && l.rubrica === "ATL") mapAtl.set(l.formando_id, Number(l.valor ?? 0));
      if (l.formando_id && l.valor_manual != null) manuaisFormando.set(`${l.formando_id}|${l.rubrica}`, Number(l.valor_manual));
      if (l.formador_id && l.recibo_confirmado) recibosFormador.set(l.formador_id, true);
      if (l.rubrica === "OUT") totalOutros += Number(l.valor ?? 0);
    });
    preview.formandos.forEach(l => {
      if (l.rubrica === "ATL") {
        const v = mapAtl.get(l.formando_id);
        if (v && v > 0) l.valor = v;
      }
    });
  }


  // Recalcular totais após aplicar ATL preservado.
  const totais = { BF: 0, BFM: 0, SA: 0, TR: 0, HN: 0, ATL: 0, geral: 0 };
  preview.formandos.forEach(l => { totais[l.rubrica] += l.valor; totais.geral += l.valor; });
  preview.formadores.forEach(l => { totais.HN += l.valor; totais.geral += l.valor; });
  totais.geral += totalOutros;
  (Object.keys(totais) as (keyof typeof totais)[]).forEach(k => (totais[k] = +totais[k].toFixed(2)));
  preview.totais = totais;

  const payload = {
    projeto_id: projetoId, curso_id: preview.curso_id, ano: preview.ano, mes: preview.mes,
    estado: "rascunho",
    total_bf: preview.totais.BF, total_bfm: preview.totais.BFM,
    total_sa: preview.totais.SA, total_tr: preview.totais.TR,
    total_hn: preview.totais.HN, total_atl: preview.totais.ATL,
    total_geral: preview.totais.geral,
  };
  if (processamentoId) {
    if (existente?.estado === "fechado") throw new Error("Processamento fechado — não pode ser recalculado.");
    const { error } = await supabase.from("fin_processamento").update(payload as never).eq("id", processamentoId);
    if (error) throw error;
    // As linhas de "outras despesas" (rubrica OUT) são manuais — nunca são recalculadas.
    await supabase.from("fin_processamento_linha").delete()
      .eq("processamento_id", processamentoId).neq("rubrica", "OUT");
  } else {
    const { data, error } = await supabase.from("fin_processamento").insert(payload as never).select("id").single();
    if (error) throw error;
    processamentoId = (data as any).id;
  }

  // Todas as linhas têm de ter exatamente as mesmas chaves: o PostgREST usa a
  // união das chaves do array e envia NULL nas que faltam (ignorando defaults).
  const linhaBase = {
    processamento_id: processamentoId,
    formando_id: null as string | null,
    formador_id: null as string | null,
    rubrica: "",
    horas_previstas: 0,
    horas_frequentadas: 0,
    horas_elegiveis: 0,
    dias_elegiveis: 0,
    valor_hora: 0,
    valor_dia: 0,
    km_total: 0,
    valor: 0,
    memoria_calculo: {} as unknown,
    valor_manual: null as number | null,
    recibo_confirmado: false,
  };

  const linhas = [
    ...preview.formandos.map(l => ({
      ...linhaBase,
      formando_id: l.formando_id, rubrica: l.rubrica,
      horas_previstas: l.horas_previstas ?? 0, horas_frequentadas: l.horas_frequentadas ?? 0,
      horas_elegiveis: l.horas_elegiveis ?? 0, dias_elegiveis: l.dias_elegiveis ?? 0,
      valor_hora: l.valor_hora ?? 0,
      valor_dia: l.valor_dia ?? 0, km_total: l.km_total ?? 0, valor: l.valor ?? 0,
      memoria_calculo: l.memoria_calculo ?? {},
      valor_manual: manuaisFormando.get(`${l.formando_id}|${l.rubrica}`) ?? null,
    })),
    ...preview.formadores.map(l => ({
      ...linhaBase,
      formador_id: l.formador_id, rubrica: l.rubrica,
      horas_frequentadas: l.horas_frequentadas ?? 0, valor_hora: l.valor_hora ?? 0, valor: l.valor ?? 0,
      memoria_calculo: l.memoria_calculo ?? {},
      recibo_confirmado: recibosFormador.get(l.formador_id) ?? false,
    })),
  ];


  if (linhas.length) {
    const { error } = await supabase.from("fin_processamento_linha").insert(linhas as never);
    if (error) throw error;
  }
  return processamentoId!;
}
