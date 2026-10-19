// @ts-ignore -- runner nativo do bun
import { expect, test } from "bun:test";
import { consultaSessoes } from "../sessoes-estado-compat";
import { sessaoNoPercurso } from "./regras";

test("repete apenas a consulta com coluna estado em falta", async () => {
  const calls: boolean[] = [];
  const result = await consultaSessoes(async comEstado => {
    calls.push(comEstado);
    return comEstado ? { data: null, error: { message: "column sessoes.estado does not exist" } } : { data: [{ horas: 3 }], error: null };
  });
  expect(calls).toEqual([true, false]);
  expect(result.data).toEqual([{ horas: 3 }]);
});

test("preserva consulta filtrada e não oculta erros de permissões", async () => {
  for (const error of [null, { message: "permission denied for table sessoes" }]) {
    const calls: boolean[] = [];
    const result = await consultaSessoes(async comEstado => {
      calls.push(comEstado);
      return { data: [], error };
    });
    expect(calls).toEqual([true]);
    expect(result.error).toEqual(error);
  }
});

test("sessões antigas sem estado contam; canceladas continuam excluídas", () => {
  const i = { data_inscricao: "2026-01-01", data_desistencia: null, data_conclusao: null };
  expect(sessaoNoPercurso({ data: "2026-02-01" }, i, "2026-10-19")).toBe(true);
  expect(sessaoNoPercurso({ data: "2026-02-01", estado: "cancelada" }, i, "2026-10-19")).toBe(false);
});