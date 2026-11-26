import { describe, expect, it } from "vitest";
import { parseFecha, plazo } from "./fechas.js";

const hoy = new Date(2026, 10, 20); // 20 de noviembre de 2026

describe("parseFecha", () => {
  it("vacío → null", () => expect(parseFecha("  ", hoy)).toBeNull());
  it("solo el día: este mes si no ha pasado", () => expect(parseFecha("25", hoy)).toBe("2026-11-25"));
  it("solo el día: el mes siguiente si ya pasó", () => expect(parseFecha("5", hoy)).toBe("2026-12-05"));
  it("el día de hoy cuenta como hoy", () => expect(parseFecha("20", hoy)).toBe("2026-11-20"));
  it("pasa de diciembre a enero", () => expect(parseFecha("3", new Date(2026, 11, 20))).toBe("2027-01-03"));
  it("día/mes y día/mes/año", () => {
    expect(parseFecha("20/12", hoy)).toBe("2026-12-20");
    expect(parseFecha("20/12/2027", hoy)).toBe("2027-12-20");
    expect(parseFecha("1-2-27", hoy)).toBe("2027-02-01");
  });
  it("formato ISO", () => expect(parseFecha("2026-12-20", hoy)).toBe("2026-12-20"));
  it("rechaza fechas imposibles", () => {
    expect(parseFecha("31/11", hoy)).toBeUndefined();
    expect(parseFecha("29/02/2027", hoy)).toBeUndefined();
    expect(parseFecha("hola", hoy)).toBeUndefined();
  });
});

describe("plazo", () => {
  const t = (extra) => ({ anulado: false, completado: false, fecha_comprometida: "2026-12-20", ...extra });
  it("sin fecha no muestra nada", () => expect(plazo(t({ dias_para_entrega: null }))).toBeNull());
  it("atrasado", () => expect(plazo(t({ dias_para_entrega: -1 }))).toEqual({ texto: "Atrasado 1 día", clase: "alerta" }));
  it("vence pronto", () => {
    expect(plazo(t({ dias_para_entrega: 0 })).texto).toBe("Vence hoy");
    expect(plazo(t({ dias_para_entrega: 1 })).texto).toBe("Vence mañana");
    expect(plazo(t({ dias_para_entrega: 2 })).texto).toBe("Entrega 20/12/2026"); // solo hoy y mañana se resaltan
  });
  it("con holgura muestra la fecha", () => expect(plazo(t({ dias_para_entrega: 10 })).texto).toBe("Entrega 20/12/2026"));
  it("entregado y anulado tienen prioridad", () => {
    expect(plazo(t({ completado: true, dias_para_entrega: null })).texto).toBe("Finalizado");
    expect(plazo(t({ anulado: true })).texto).toBe("Anulado");
  });
});
