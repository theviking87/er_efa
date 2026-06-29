export const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("pt-PT");
};

export const ESTADO_FORMADOR_LABEL: Record<string, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
  arquivado: "Arquivado",
};

export function uid(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function nowIso(): string {
  return new Date().toISOString();
}
