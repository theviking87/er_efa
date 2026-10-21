// @ts-ignore -- runner nativo do bun
import { expect, test } from "bun:test";
import { disciplinasFrequentadas, horasFrequenciaSessao, sessaoNoPercurso, horasRelatorioUfcd, diasRelatorio } from "./regras";

test("previstas consideram apenas as disciplinas selecionadas", () => {
  const disciplinas = [{ id: "a", horas: 50 }, { id: "b", horas: 25 }];
  const ids = disciplinasFrequentadas(disciplinas.map(d => d.id), [{ curso_ufcd_id: "a", frequenta: true }, { curso_ufcd_id: "b", frequenta: false }]);
  expect(disciplinas.filter(d => ids.has(d.id)).reduce((s, d) => s + d.horas, 0)).toBe(50);
  expect([...disciplinasFrequentadas(["a", "b"], [])]).toEqual(["a", "b"]);
});
test("PRA assistido desconta faltas e inclui presença online", () => {
  const i = { data_inscricao: "2026-01-01", data_desistencia: null, data_conclusao: null };
  expect(horasRelatorioUfcd([
    { id: "pra1", data: "2026-01-05", horas: 3, estado: "realizada" },
    { id: "pra2", data: "2026-01-06", horas: 4, estado: "realizada" },
  ], [{ sessao_id: "pra1", tipo: "justificada", horas: 1 }, { sessao_id: "pra2", tipo: "online", horas: 0 }], i, "2026-10-19"))
    .toMatchObject({ ministradas: 7, assistidas: 6, presenciais: 2, online: 4 });
});
test("online de janeiro conta com inscrição administrativa em julho, sem presumir presença nas restantes sessões", () => {
  const i = { data_inscricao: "2026-07-01", data_desistencia: null, data_conclusao: null };
  const sessoes = [
    { id: "on", data: "2026-01-05", horas: 3, estado: "realizada" },
    { id: "sem", data: "2026-01-06", horas: 4, estado: "realizada" },
    { id: "cancelada", data: "2026-01-07", horas: 4, estado: "cancelada" },
  ];
  const registos = [{ sessao_id: "on", tipo: "online", horas: 0 }, { sessao_id: "cancelada", tipo: "online", horas: 0 }];
  expect(horasRelatorioUfcd(sessoes, registos, i, "2026-10-19")).toMatchObject({ ministradas: 3, assistidas: 3, presenciais: 0, online: 3 });
  expect(horasRelatorioUfcd(sessoes, registos, { ...i, data_desistencia: "2026-01-05" }, "2026-10-19").online).toBe(0);
});
test("cada 7 horas assistidas equivale a um dia, preservando frações", () => {
  expect(diasRelatorio(14, [])["Dias equivalentes (7h)"]).toBe(2);
  expect(diasRelatorio(3.5, [])["Dias equivalentes (7h)"]).toBe(0.5);
});
test("conta horas online e presenciais, mas cada data apenas uma vez", () => {
  const i = { data_inscricao: "2026-01-01", data_desistencia: null, data_conclusao: null };
  const h = horasRelatorioUfcd([
    { id: "a", data: "2026-01-05", horas: 3 },
    { id: "b", data: "2026-01-05", horas: 4 },
    { id: "c", data: "2026-01-06", horas: 7 },
  ], [{ sessao_id: "b", tipo: "online", horas: 0 }, { sessao_id: "c", tipo: "ausencia", horas: 7 }], i, "2026-10-20");
  expect(h.assistidas).toBe(7);
  expect(h.online).toBe(4);
  expect(diasRelatorio(h.assistidas, h.datasAssistidas)).toEqual({ "Dias equivalentes (7h)": 1, "Dias de calendário": 1 });
  expect(diasRelatorio(14, [...h.datasAssistidas, ...h.datasAssistidas])["Dias de calendário"]).toBe(1);
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
test("corrigir inscrição posterior à desistência recupera o histórico, não as horas após desistir", () => {
  const sessoes = [
    { id: "novembro", data: "2025-11-03", horas: 7, estado: "realizada" },
    { id: "maio", data: "2026-05-04", horas: 7, estado: "realizada" },
    { id: "junho", data: "2026-06-29", horas: 7, estado: "realizada" },
    { id: "desistencia", data: "2026-06-30", horas: 7, estado: "realizada" },
    { id: "julho", data: "2026-07-01", horas: 7, estado: "realizada" },
  ];
  const insc = { data_inscricao: "2026-07-01", data_desistencia: "2026-06-30", data_conclusao: null };
  expect(horasRelatorioUfcd(sessoes, [], insc, "2026-10-20").assistidas).toBe(0);
  const corrigido = horasRelatorioUfcd(sessoes, [], { ...insc, data_inscricao: "2025-11-03" }, "2026-10-20");
  expect(corrigido.assistidas).toBe(21);
  expect([...corrigido.datasAssistidas]).toEqual(["2025-11-03", "2026-05-04", "2026-06-29"]);
});