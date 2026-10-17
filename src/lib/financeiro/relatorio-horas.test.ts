// @ts-ignore -- runner nativo do bun
import { expect, test } from "bun:test";
import { disciplinasFrequentadas, horasFrequenciaSessao, sessaoNoPercurso } from "./regras";

test("previstas consideram apenas as disciplinas selecionadas", () => {
  const disciplinas = [{ id: "a", horas: 50 }, { id: "b", horas: 25 }];
  const ids = disciplinasFrequentadas(disciplinas.map(d => d.id), [{ curso_ufcd_id: "a", frequenta: true }, { curso_ufcd_id: "b", frequenta: false }]);
  expect(disciplinas.filter(d => ids.has(d.id)).reduce((s, d) => s + d.horas, 0)).toBe(50);
  expect([...disciplinasFrequentadas(["a", "b"], [])]).toEqual(["a", "b"]);
});
test("marcador online com zero horas conta toda a sessão como frequência online", () => {
  expect(horasFrequenciaSessao(3, [{ tipo: "online", horas: 0 }])).toEqual({ frequentadas: 3, presenciais: 0, online: 3 });
});
test("frequência presencial desconta faltas justificadas e injustificadas", () => {
  expect(horasFrequenciaSessao(6, [{ tipo: "justificada", horas: 1 }, { tipo: "injustificada", horas: 2 }])).toEqual({ frequentadas: 3, presenciais: 3, online: 0 });
  expect(horasFrequenciaSessao(3, [{ tipo: "ausencia", horas: 5 }]).frequentadas).toBe(0);
});
test("só sessões realizadas dentro da inscrição contam", () => {
  const i = { data_inscricao: "2026-01-01", data_desistencia: "2026-03-01", data_conclusao: null };
  const valid = { estado: "realizada", data: "2026-02-01" };
  expect(sessaoNoPercurso(valid, i, "2026-10-17")).toBe(true);
  for (const estado of ["cancelada", "nao_realizada", "reagendada"]) expect(sessaoNoPercurso({ ...valid, estado }, i, "2026-10-17")).toBe(false);
  expect(sessaoNoPercurso({ ...valid, data: "2026-03-01" }, i, "2026-10-17")).toBe(false);
  expect(sessaoNoPercurso({ ...valid, data: "2025-12-31" }, i, "2026-10-17")).toBe(false);
});