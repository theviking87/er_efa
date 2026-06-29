import { count } from "../db/sqljs";
import { KNOWN_TABLES } from "../db/schema";

export default function Dashboard() {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Painel — versão offline</h1>
      <p className="text-sm text-slate-500 mb-6">
        A trabalhar a partir do <code>database.db</code> na pen. Todas as alterações são
        gravadas automaticamente.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {KNOWN_TABLES.map((t) => (
          <div key={t} className="card">
            <div className="text-xs uppercase tracking-wide text-slate-500">{t}</div>
            <div className="text-2xl font-semibold mt-1">{safeCount(t)}</div>
          </div>
        ))}
      </div>

      <div className="card mt-6">
        <div className="text-sm font-medium mb-1">Próximos passos</div>
        <p className="text-sm text-slate-600">
          Este é o esqueleto da app offline. Os ecrãs (formadores, cursos, cronograma…)
          vão ser portados nos próximos turnos. Os dados já estão todos carregados na BD.
        </p>
      </div>
    </div>
  );
}

function safeCount(t: string): number {
  try {
    return count(t);
  } catch {
    return 0;
  }
}
