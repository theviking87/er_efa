export const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
};

export const fmtDateTime = (d?: string | null) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export const fmtHoras = (n?: number | null) => `${(n ?? 0).toString().replace(".", ",")} h`;

export const ESTADO_FORMADOR_LABEL: Record<string, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
  ferias: "Férias",
  baixa_medica: "Baixa Médica",
  suspenso: "Suspenso",
  arquivado: "Arquivado",
};

export const ESTADO_CURSO_LABEL: Record<string, string> = {
  planeado: "Planeado",
  ativo: "Ativo",
  concluido: "Concluído",
  suspenso: "Suspenso",
  cancelado: "Cancelado",
};

export const TIPOLOGIA_LABEL: Record<string, string> = {
  EFA: "EFA",
  ERFA: "ERFA",
  MFA: "MFA",
  OUTRO: "Outro",
};

export function diffHoras(inicio: string, fim: string): number {
  const [hi, mi] = inicio.split(":").map(Number);
  const [hf, mf] = fim.split(":").map(Number);
  return Math.max(0, (hf * 60 + mf - hi * 60 - mi) / 60);
}

export const MONTH_NAMES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

export const WEEKDAY_SHORT = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
