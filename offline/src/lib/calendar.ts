// Local-date helpers (no timezone shifts) + hour-diff with lunch break.

export const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function pad2(n: number): string {
  return n < 10 ? "0" + n : "" + n;
}

export function toLocalISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function monthDays(year: number, month0: number): string[] {
  const out: string[] = [];
  const last = new Date(year, month0 + 1, 0).getDate();
  for (let i = 1; i <= last; i++) out.push(toLocalISO(new Date(year, month0, i)));
  return out;
}

/** Returns hours between HH:MM strings, subtracting 1h if the slot spans 13:00–14:00. */
export function diffHoras(inicio: string, fim: string): number {
  const [h1, m1] = inicio.slice(0, 5).split(":").map(Number);
  const [h2, m2] = fim.slice(0, 5).split(":").map(Number);
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins <= 0) return 0;
  const startMin = h1 * 60 + m1;
  const endMin = h2 * 60 + m2;
  if (startMin <= 13 * 60 && endMin >= 14 * 60) mins -= 60;
  return Math.max(0, mins / 60);
}

export function weekdayShort(iso: string): string {
  return WEEKDAY_SHORT[parseISO(iso).getDay()];
}

export function isWeekend(iso: string): boolean {
  const d = parseISO(iso).getDay();
  return d === 0 || d === 6;
}
