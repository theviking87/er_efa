// Feriados nacionais (Portugal) + municipais de Viana do Castelo e Barroselas

function easterSunday(year: number): Date {
  // Algoritmo de Meeus/Jones/Butcher
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function feriadosDoAno(ano: number): Map<string, string> {
  const m = new Map<string, string>();
  const fix = (mm: number, dd: number, nome: string) =>
    m.set(`${ano}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`, nome);

  // Nacionais fixos
  fix(1, 1, "Ano Novo");
  fix(4, 25, "Dia da Liberdade");
  fix(5, 1, "Dia do Trabalhador");
  fix(6, 10, "Dia de Portugal");
  fix(8, 15, "Assunção de Nossa Senhora");
  fix(10, 5, "Implantação da República");
  fix(11, 1, "Todos os Santos");
  fix(12, 1, "Restauração da Independência");
  fix(12, 8, "Imaculada Conceição");
  fix(12, 25, "Natal");

  // Nacionais móveis
  const easter = easterSunday(ano);
  m.set(iso(addDays(easter, -47)), "Carnaval");
  m.set(iso(addDays(easter, -2)), "Sexta-feira Santa");
  m.set(iso(easter), "Páscoa");
  m.set(iso(addDays(easter, 60)), "Corpo de Deus");

  // Municipais
  fix(8, 20, "N. Sra. da Agonia (Viana do Castelo)");
  fix(9, 29, "São Miguel (Barroselas)");

  return m;
}

const cache = new Map<number, Map<string, string>>();

export function feriadoNome(isoDate: string): string | null {
  if (!isoDate || isoDate.length < 10) return null;
  const ano = Number(isoDate.slice(0, 4));
  if (!Number.isFinite(ano)) return null;
  if (!cache.has(ano)) cache.set(ano, feriadosDoAno(ano));
  return cache.get(ano)!.get(isoDate.slice(0, 10)) ?? null;
}

export function isFeriado(isoDate: string): boolean {
  return feriadoNome(isoDate) !== null;
}
