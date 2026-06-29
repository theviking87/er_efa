import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { all } from "../db/sqljs";
import { MONTH_LABELS, monthDays, parseISO, isWeekend } from "../lib/calendar";

type SessaoRow = {
  id: string;
  data: string;
  hora_inicio?: string | null;
  hora_fim?: string | null;
  curso_id: string;
  curso_nome?: string | null;
  curso_codigo?: string | null;
  ufcd_codigo?: string | null;
  formador_nome?: string | null;
  formador_cor?: string | null;
};

export default function CronogramaGeral() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month0, setMonth0] = useState(today.getMonth());
  const [cursoFilter, setCursoFilter] = useState<string>("");

  const cursos = useMemo(() => {
    try { return all<{ id: string; nome: string }>(`SELECT id, nome FROM cursos ORDER BY nome COLLATE NOCASE`); }
    catch { return []; }
  }, []);

  const sessoes = useMemo<SessaoRow[]>(() => {
    try {
      return all<SessaoRow>(
        `SELECT s.id, s.data, s.hora_inicio, s.hora_fim, s.curso_id,
                c.nome AS curso_nome, c.codigo AS curso_codigo,
                u.codigo AS ufcd_codigo,
                f.nome AS formador_nome, f.cor AS formador_cor
         FROM sessoes s
         LEFT JOIN cursos c ON c.id = s.curso_id
         LEFT JOIN curso_ufcds cu ON cu.id = s.curso_ufcd_id
         LEFT JOIN ufcds u ON u.id = cu.ufcd_id
         LEFT JOIN formadores f ON f.id = s.formador_id
         WHERE substr(s.data, 1, 7) = ?`,
        [`${year}-${month0 < 9 ? "0" : ""}${month0 + 1}`],
      );
    } catch { return []; }
  }, [year, month0]);

  const filtered = cursoFilter ? sessoes.filter((s) => s.curso_id === cursoFilter) : sessoes;

  const byDay = useMemo(() => {
    const map: Record<string, SessaoRow[]> = {};
    for (const s of filtered) (map[s.data] ??= []).push(s);
    for (const k of Object.keys(map)) map[k].sort((a, b) => (a.hora_inicio ?? "").localeCompare(b.hora_inicio ?? ""));
    return map;
  }, [filtered]);

  const days = monthDays(year, month0);
  const firstDow = parseISO(days[0]).getDay();
  const blanks = (firstDow + 6) % 7;

  function prevMonth() { if (month0 === 0) { setYear(year - 1); setMonth0(11); } else setMonth0(month0 - 1); }
  function nextMonth() { if (month0 === 11) { setYear(year + 1); setMonth0(0); } else setMonth0(month0 + 1); }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cronograma geral</h1>
          <p className="text-sm text-slate-500">Vista mensal de todas as sessões. Edita cada sessão dentro do curso respetivo.</p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <button className="btn btn-outline" onClick={prevMonth}>‹</button>
        <div className="font-semibold w-44 text-center">{MONTH_LABELS[month0]} {year}</div>
        <button className="btn btn-outline" onClick={nextMonth}>›</button>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-500">Curso</span>
          <select className="input max-w-xs" value={cursoFilter} onChange={(e) => setCursoFilter(e.target.value)}>
            <option value="">— Todos —</option>
            {cursos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
          {["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map((d) => (
            <div key={d} className="px-2 py-2 text-center font-medium">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: blanks }).map((_, i) => (
            <div key={`b${i}`} className="h-32 border-r border-b border-slate-100 bg-slate-50/50" />
          ))}
          {days.map((iso) => {
            const dayNum = parseISO(iso).getDate();
            const we = isWeekend(iso);
            const list = byDay[iso] ?? [];
            return (
              <div key={iso} className={`h-32 border-r border-b border-slate-100 p-1.5 overflow-hidden flex flex-col gap-1 ${we ? "bg-slate-50" : ""}`}>
                <div className="text-xs font-medium text-slate-600">{dayNum}</div>
                <div className="flex-1 space-y-1 overflow-auto text-[11px]">
                  {list.map((s) => (
                    <Link
                      key={s.id}
                      to={`/cursos/${s.curso_id}`}
                      className="block rounded px-1.5 py-1 hover:opacity-80"
                      style={{ background: (s.formador_cor || "#e2e8f0") + "40", borderLeft: `3px solid ${s.formador_cor || "#94a3b8"}` }}
                      title={`${s.curso_nome ?? ""} · ${s.ufcd_codigo ?? ""} · ${s.formador_nome ?? "em falta"}`}
                    >
                      <div className="font-mono">{(s.hora_inicio ?? "").slice(0, 5)}-{(s.hora_fim ?? "").slice(0, 5)}</div>
                      <div className="truncate">{s.curso_codigo ?? s.curso_nome ?? "—"}</div>
                      <div className="truncate font-medium">{s.formador_nome ?? <span className="italic text-rose-600">em falta</span>}</div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
