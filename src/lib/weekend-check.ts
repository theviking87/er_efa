// Helper para avisar quando uma data cai ao fim de semana.
// Usa confirm() para bloquear o fluxo até o utilizador decidir prosseguir.

const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function parseISO(iso: string): Date | null {
  if (!iso || iso.length < 10) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function isWeekendISO(iso: string): boolean {
  const d = parseISO(iso);
  if (!d) return false;
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

/**
 * Se a data for sábado ou domingo, pede confirmação ao utilizador.
 * Devolve true se pode continuar, false se o utilizador cancelou.
 * Se a data não for fim de semana, devolve true diretamente.
 */
export function confirmarFimDeSemana(iso: string, contexto = "este lançamento"): boolean {
  if (!isWeekendISO(iso)) return true;
  const d = parseISO(iso)!;
  const nome = WEEKDAY_LABELS[d.getDay()];
  return window.confirm(
    `⚠ Atenção: ${iso} é ${nome} (fim de semana).\n\nTens a certeza que queres prosseguir com ${contexto}?`,
  );
}

/**
 * Versão para múltiplas datas — devolve true se nenhuma for FDS
 * ou se o utilizador confirmou.
 */
export function confirmarFimDeSemanaMultiplo(isos: string[], contexto = "estes lançamentos"): boolean {
  const fds = Array.from(new Set(isos.filter(isWeekendISO))).sort();
  if (fds.length === 0) return true;
  const lista = fds.slice(0, 8).join(", ") + (fds.length > 8 ? `, +${fds.length - 8}` : "");
  return window.confirm(
    `⚠ Atenção: ${fds.length} data(s) caem ao fim de semana:\n${lista}\n\nTens a certeza que queres prosseguir com ${contexto}?`,
  );
}
