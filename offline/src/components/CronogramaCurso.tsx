import { useMemo, useState } from "react";
import { all, exec } from "../db/sqljs";
import {
  MONTH_LABELS, WEEKDAY_SHORT, monthDays, parseISO, isWeekend,
} from "../lib/calendar";
import { SessaoDialog, type SessaoRow } from "./SessaoDialog";

type SessaoView = SessaoRow & {
  ufcd_codigo?: string | null;
  formador_nome?: string | null;
};

export function CronogramaCurso({ cursoId }: { cursoId: string }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month0, setMonth0] = useState(today.getMonth());
  const [tick, setTick] = useState(0);
  const [dialog, setDialog] = useState<{ data: string; sessao?: SessaoView } | null>(null);

  const sessoes = useMemo<SessaoView[]>(() => {
    try {
      return all<SessaoView>(
        `SELECT s.*, u.codigo AS ufcd_codigo, f.nome AS formador_nome
         FROM sessoes s
         LEFT JOIN curso_ufcds cu ON cu.id = s.curso_ufcd_id
         LEFT JOIN ufcds u ON u.id = cu.ufcd_id
         LEFT JOIN formadores f ON f.id = s.formador_id
         WHERE s.curso_id = ?
           AND substr(s.data, 1, 7) = ?`,
        [cursoId, `${year}-${month0 < 9 ? "0" : ""}${month0 + 1}`],
      );
    } catch { return []; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursoId, year, month0, tick]);

  const byDay = useMemo(() => {
    const map: Record<string, SessaoView[]> = {};
    for (const s of sessoes) {
      (map[s.data] ??= []).push(s);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.hora_inicio ?? "").localeCompare(b.hora_inicio ?? ""));
    }
    return map;
  }, [sessoes]);

  const days = monthDays(year, month0);
  const firstDow = parseISO(days[0]).getDay();
  const blanks = (firstDow + 6) % 7; // Monday start

  function prevMonth() {
    if (month0 === 0) { setYear(year - 1); setMonth0(11); }
    else setMonth0(month0 - 1);
  }
  function nextMonth() {
    if (month0 === 11) { setYear(year + 1); setMonth0(0); }
    else setMonth0(month0 + 1);
  }

  function removeSessao(id: string) {
    if (!confirm("Remover esta sessão?")) return;
    exec(`DELETE FROM sessoes WHERE id=?`, [id]);
    setTick((t) => t + 1);
  }

  const totalHoras = sessoes.reduce((s, r) => s + (Number(r.horas) || 0), 0);

  // Resumo por UFCD: horas totais vs dadas (todas as sessões do curso, não só do mês)
  const resumoUfcds = useMemo(() => {
    try {
      return all<{ codigo: string | null; nome: string | null; horas_total: number | null; horas_dadas: number | null; estado: string | null }>(
        `SELECT u.codigo, u.nome, u.horas AS horas_total, cu.estado,
                COALESCE((SELECT SUM(s.horas) FROM sessoes s WHERE s.curso_ufcd_id = cu.id), 0) AS horas_dadas
         FROM curso_ufcds cu LEFT JOIN ufcds u ON u.id = cu.ufcd_id
         WHERE cu.curso_id = ?`,
        [cursoId],
      );
    } catch { return []; }
  }, [cursoId, tick]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2">
          <button className="btn btn-outline" onClick={prevMonth}>‹</button>
          <div className="font-semibold w-44 text-center">
            {MONTH_LABELS[month0]} {year}
          </div>
          <button className="btn btn-outline" onClick={nextMonth}>›</button>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-slate-600">
            {sessoes.length} sessões · <strong>{totalHoras}h</strong>
          </div>
          <button className="btn btn-outline" onClick={() => window.print()}>Imprimir</button>
        </div>
      </div>

      {resumoUfcds.length > 0 && (
        <details className="bg-white border border-slate-200 rounded-lg print:hidden" open>
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium bg-slate-50 border-b border-slate-200">
            Resumo de horas por UFCD
          </summary>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left font-medium px-4 py-2 w-24">Código</th>
                <th className="text-left font-medium px-4 py-2">UFCD</th>
                <th className="text-right font-medium px-4 py-2 w-20">Dadas</th>
                <th className="text-right font-medium px-4 py-2 w-20">Total</th>
                <th className="text-right font-medium px-4 py-2 w-20">Em falta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {resumoUfcds.map((r, i) => {
                const total = Number(r.horas_total) || 0;
                const dadas = Number(r.horas_dadas) || 0;
                const falta = Math.max(0, total - dadas);
                return (
                  <tr key={i}>
                    <td className="px-4 py-1.5 font-mono text-xs">{r.codigo ?? "—"}</td>
                    <td className="px-4 py-1.5">{r.nome ?? "—"}</td>
                    <td className="px-4 py-1.5 text-right">{dadas}h</td>
                    <td className="px-4 py-1.5 text-right text-slate-500">{total}h</td>
                    <td className={`px-4 py-1.5 text-right font-medium ${falta > 0 ? "text-rose-600" : "text-emerald-600"}`}>{falta}h</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
          {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
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
              <div
                key={iso}
                className={`h-32 border-r border-b border-slate-100 p-1.5 overflow-hidden flex flex-col gap-1 ${we ? "bg-slate-50" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-600">{dayNum}</span>
                  <button
                    className="text-xs text-slate-400 hover:text-slate-900"
                    onClick={() => setDialog({ data: iso })}
                    title="Nova sessão"
                  >+</button>
                </div>
                <div className="flex-1 space-y-1 overflow-auto text-[11px]">
                  {list.map((s) => (
                    <div
                      key={s.id}
                      className={`rounded px-1.5 py-1 cursor-pointer ${s.formador_id ? "bg-emerald-50 text-emerald-900 hover:bg-emerald-100" : "bg-rose-50 text-rose-900 hover:bg-rose-100"}`}
                      onClick={() => setDialog({ data: iso, sessao: s })}
                    >
                      <div className="font-mono">
                        {(s.hora_inicio ?? "").slice(0, 5)}-{(s.hora_fim ?? "").slice(0, 5)}
                      </div>
                      <div className="truncate">{s.ufcd_codigo ?? "—"}</div>
                      <div className="truncate font-medium">
                        {s.formador_nome ?? <span className="italic">em falta</span>}
                      </div>
                      <button
                        className="text-[10px] text-rose-600 hover:underline"
                        onClick={(e) => { e.stopPropagation(); removeSessao(s.id); }}
                      >remover</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {dialog && (
        <SessaoDialog
          open
          cursoId={cursoId}
          data={dialog.data}
          initial={dialog.sessao ?? null}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); setTick((t) => t + 1); }}
        />
      )}
    </div>
  );
}
