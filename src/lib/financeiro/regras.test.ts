// @ts-ignore -- runner nativo do bun
import { describe, expect, test } from "bun:test";
import { limiteFaltasJustificadas, diasSubsidios, calcularAssiduidade, sessaoElegivel } from "./regras";

describe("limite 10% faltas justificadas (percurso 1000h → 100h)", () => {
  const base = { horasPercurso: 1000, percentagem: 10 };
  test("inferior", () => expect(limiteFaltasJustificadas({ ...base, justificadasAnteriores: 0, justificadasMes: 50 }).excedenteMes).toBe(0));
  test("igual", () => { const r = limiteFaltasJustificadas({ ...base, justificadasAnteriores: 60, justificadasMes: 40 }); expect(r.excedenteMes).toBe(0); expect(r.restante).toBe(0); });
  test("superior acumulado entre meses", () => { const r = limiteFaltasJustificadas({ ...base, justificadasAnteriores: 90, justificadasMes: 25 }); expect(r.pagaveisMes).toBe(10); expect(r.excedenteMes).toBe(15); });
  test("limite já esgotado", () => expect(limiteFaltasJustificadas({ ...base, justificadasAnteriores: 120, justificadasMes: 6 }).excedenteMes).toBe(6));
});

describe("SA limiar 3h e TR online", () => {
  const horas = new Map([["d1", 2.5], ["d2", 3], ["d3", 7]]);
  test("<3h não, =3h sim, >3h sim", () => expect(diasSubsidios({ horasPorDia: horas, faltasPorDia: new Map(), diasOnline: new Set(), limiarHoras: 3 }).diasSa).toBe(2));
  test("várias sessões no mesmo dia contam 1 dia", () => expect(diasSubsidios({ horasPorDia: new Map([["d", 6]]), faltasPorDia: new Map(), diasOnline: new Set(), limiarHoras: 3 }).diasSa).toBe(1));
  test("falta reduz abaixo do limiar", () => expect(diasSubsidios({ horasPorDia: new Map([["d", 4]]), faltasPorDia: new Map([["d", 2]]), diasOnline: new Set(), limiarHoras: 3 }).diasSa).toBe(0));
  test("online: SA sim, TR não", () => { const r = diasSubsidios({ horasPorDia: new Map([["a", 6], ["b", 6]]), faltasPorDia: new Map(), diasOnline: new Set(["b"]), limiarHoras: 3 }); expect([r.diasSa, r.diasTr, r.diasTrExcluidosOnline]).toEqual([2, 1, 1]); });
});

describe("sessões", () => {
  test("só realizadas contam", () => { expect(sessaoElegivel({ estado: "realizada" })).toBe(true); expect(sessaoElegivel({ estado: "cancelada" })).toBe(false); expect(sessaoElegivel({ estado: "reagendada" })).toBe(false); });
});

describe("assiduidade EFA 90% / 50%", () => {
  const ucs = [{ curso_ufcd_id: "A", nome: "A" }, { curso_ufcd_id: "B", nome: "B" }];
  const sessoes = [{ id: "s1", curso_ufcd_id: "A", horas: 50 }, { id: "s2", curso_ufcd_id: "B", horas: 50 }, { id: "s3", curso_ufcd_id: "B", horas: 25, estado: "cancelada" }];
  test("cumpre", () => { const r = calcularAssiduidade({ ucs, sessoes, faltas: [{ sessao_id: "s1", horas: 5, tipo: "justificada" }, { sessao_id: "s2", horas: 5, tipo: "online" }] }); expect(r.pctGlobal).toBe(95); expect(r.cumpre90).toBe(true); expect(r.requerAnalise).toBe(false); });
  test("falha 90% e 50% numa UFCD", () => { const r = calcularAssiduidade({ ucs, sessoes, faltas: [{ sessao_id: "s2", horas: 30, tipo: "injustificada" }] }); expect(r.pctGlobal).toBe(70); expect(r.cumpre90).toBe(false); expect(r.ucsEmFalha.map((u) => u.curso_ufcd_id)).toEqual(["B"]); });
  test("recuperação repõe horas", () => { const r = calcularAssiduidade({ ucs, sessoes, faltas: [{ sessao_id: "s2", horas: 30, tipo: "injustificada" }], recuperadasPorUc: new Map([["B", 25]]) }); expect(r.porUc[1].pct).toBe(90); expect(r.pctGlobal).toBe(95); expect(r.cumpre90).toBe(true); });
  test("falta em sessão cancelada ignorada", () => expect(calcularAssiduidade({ ucs, sessoes, faltas: [{ sessao_id: "s3", horas: 25, tipo: "injustificada" }] }).pctGlobal).toBe(100));
});
