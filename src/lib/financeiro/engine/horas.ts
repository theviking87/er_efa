// Cálculo de horas previstas e frequentadas por formando/mês.
// Nunca deve ser preenchido manualmente sem passar por auditoria.
import type { ContextoProcessamento } from "./types";

export type HorasFormando = {
  formando_id: string;
  curso_formando_id: string;
  horas_previstas: number;
  horas_faltas: number;
  horas_frequentadas: number;
  dias_com_frequencia: number;
  dias_elegiveis_subsidio: number; // dias com >= dias_minimos horas frequentadas
  presencas_por_dia: Map<string, number>;
};

export function calcularHoras(
  ctx: ContextoProcessamento,
  diasMinimosSubsidio: number,
): Map<string, HorasFormando> {
  const horasSessoesPorDia = new Map<string, number>();
  ctx.sessoes.forEach((s) => {
    horasSessoesPorDia.set(s.data, (horasSessoesPorDia.get(s.data) ?? 0) + s.horas);
  });
  const totalPrevisto = Array.from(horasSessoesPorDia.values()).reduce((a, b) => a + b, 0);

  const faltasPorFormando = new Map<string, Map<string, number>>();
  ctx.faltas.forEach((f) => {
    if (!faltasPorFormando.has(f.curso_formando_id))
      faltasPorFormando.set(f.curso_formando_id, new Map());
    const m = faltasPorFormando.get(f.curso_formando_id)!;
    m.set(f.data, (m.get(f.data) ?? 0) + f.horas);
  });

  const out = new Map<string, HorasFormando>();
  ctx.formandos.forEach((f) => {
    const faltasDia = faltasPorFormando.get(f.curso_formando_id) ?? new Map();
    let faltas = 0;
    const presencasPorDia = new Map<string, number>();
    horasSessoesPorDia.forEach((h, dia) => {
      const fh = Math.min(faltasDia.get(dia) ?? 0, h);
      faltas += fh;
      presencasPorDia.set(dia, Math.max(0, h - fh));
    });
    const frequentadas = Math.max(0, totalPrevisto - faltas);
    let dias = 0;
    let diasSubsidio = 0;
    presencasPorDia.forEach((h) => {
      if (h > 0) dias += 1;
      if (h >= diasMinimosSubsidio) diasSubsidio += 1;
    });
    out.set(f.formando_id, {
      formando_id: f.formando_id,
      curso_formando_id: f.curso_formando_id,
      horas_previstas: totalPrevisto,
      horas_faltas: faltas,
      horas_frequentadas: frequentadas,
      dias_com_frequencia: dias,
      dias_elegiveis_subsidio: diasSubsidio,
      presencas_por_dia: presencasPorDia,
    });
  });
  return out;
}
