export function dateOnlyIso(year: number, monthIndex: number, day: number) {
  const dt = new Date(Date.UTC(year, monthIndex, day));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function localDateIso(date = new Date()) {
  return dateOnlyIso(date.getFullYear(), date.getMonth(), date.getDate());
}

export function parseDateOnly(dateStr?: string | Date | null): Date | null {
  if (!dateStr) return null;
  if (dateStr instanceof Date) {
    if (isNaN(dateStr.getTime())) return null;
    return new Date(Date.UTC(dateStr.getUTCFullYear(), dateStr.getUTCMonth(), dateStr.getUTCDate()));
  }
  if (typeof dateStr !== "string") return null;
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!iso) return null;
  const result = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  if (result.getUTCFullYear() !== +iso[1] || result.getUTCMonth() !== +iso[2] - 1 || result.getUTCDate() !== +iso[3]) return null;
  return result;
}

export function addDaysIso(dateStr: string, days: number) {
  const dt = parseDateOnly(dateStr);
  if (!dt) return dateStr;
  dt.setUTCDate(dt.getUTCDate() + days);
  return dateOnlyIso(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}

export function weekdayFromIso(dateStr: string) {
  return parseDateOnly(dateStr)?.getUTCDay() ?? 0;
}

export const fmtDate = (d?: string | Date | null) => {
  if (!d) return "—";
  const dateOnly = parseDateOnly(d);
  if (dateOnly) return `${String(dateOnly.getUTCDate()).padStart(2, "0")}/${String(dateOnly.getUTCMonth() + 1).padStart(2, "0")}/${dateOnly.getUTCFullYear()}`;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
};

export const fmtDateTime = (d?: string | Date | null) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
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

export const ESTADO_FORMANDO_LABEL: Record<string, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
  desistente: "Desistente",
  concluido: "Concluído",
};

export const INSCRICAO_ESTADO_LABEL: Record<string, string> = {
  inscrito: "Inscrito",
  em_formacao: "Em formação",
  concluido: "Concluído",
  desistente: "Desistente",
};

export const FALTA_TIPO_LABEL: Record<string, string> = {
  justificada: "Justificada",
  injustificada: "Injustificada",
};

// Pausa de almoço: 13:00 - 14:00 é descontada automaticamente quando
// o intervalo da sessão a inclui (ex.: 9h-17h conta 7h, dia inteiro conta 7h).
const ALMOCO_INI = 13 * 60;
const ALMOCO_FIM = 14 * 60;

export function diffHoras(inicio: string, fim: string): number {
  const [hi, mi] = inicio.split(":").map(Number);
  const [hf, mf] = fim.split(":").map(Number);
  const ini = hi * 60 + mi;
  const fim_ = hf * 60 + mf;
  const bruto = Math.max(0, fim_ - ini);
  const overlap = Math.max(0, Math.min(fim_, ALMOCO_FIM) - Math.max(ini, ALMOCO_INI));
  return Math.max(0, (bruto - overlap) / 60);
}

export const MONTH_NAMES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

export const WEEKDAY_SHORT = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];

export const formadorLabel = (f?: { nome?: string | null; abreviatura?: string | null } | null) =>
  (f?.abreviatura?.trim() || f?.nome || "—");
