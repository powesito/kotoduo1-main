import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import NuevoTrabajo from "./NuevoTrabajo.jsx";

const cat = {
  estados: [
    { id: 1, nombre_estado: "Recibido", orden: 0 },
    { id: 2, nombre_estado: "Diseño", orden: 1 },
    { id: 3, nombre_estado: "Entregado", orden: 2 },
  ],
  areas: [
    { id: 1, nombre_area: "Bordado" },
    { id: 2, nombre_area: "Grabado" },
  ],
  trabajadores: [
    { id: 7, nombre: "Ana Soto", area: 1 },
    { id: 8, nombre: "Luis Rojas", area: 2 },
  ],
};

let enviados;
beforeEach(() => {
  enviados = [];
  vi.stubGlobal("fetch", (url, opts) => {
    enviados.push({ url, body: JSON.parse(opts.body) });
    return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ id: 5, codigo: "KT-0005" }) });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const escribir = (etiqueta, valor) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
const llenarBase = () => {
  escribir("Cliente", "Colegio");
  escribir("Tipo de trabajo", "Bordado");
  escribir("Descripción", "60 buzos");
};

describe("NuevoTrabajo", () => {
  it("rechaza una fecha de entrega no válida sin llamar al servidor", async () => {
    render(<NuevoTrabajo cat={cat} onCreado={() => {}} />);
    llenarBase();
    escribir(/Fecha de entrega/, "99/99");
    fireEvent.click(screen.getByRole("button", { name: "Guardar trabajo" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Fecha no válida/);
    expect(enviados).toHaveLength(0);
  });

  it("exige al menos 2 etapas", async () => {
    render(<NuevoTrabajo cat={cat} onCreado={() => {}} />);
    llenarBase();
    fireEvent.click(screen.getByLabelText("Diseño"));
    fireEvent.click(screen.getByLabelText("Entregado"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar trabajo" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/al menos 2 etapas/);
    expect(enviados).toHaveLength(0);
  });

  it("al elegir un área solo ofrece a las personas de esa área", () => {
    render(<NuevoTrabajo cat={cat} onCreado={() => {}} />);
    expect(screen.getByRole("option", { name: "Luis Rojas" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Área inicial/), { target: { value: "1" } });
    expect(screen.queryByRole("option", { name: "Luis Rojas" })).toBeNull();
    expect(screen.getByRole("option", { name: "Ana Soto" })).toBeTruthy();
  });

  it("envía el trabajo con la cantidad numérica y las etapas elegidas", async () => {
    const onCreado = vi.fn();
    render(<NuevoTrabajo cat={cat} onCreado={onCreado} />);
    llenarBase();
    escribir(/Cantidad/, "60");
    fireEvent.click(screen.getByLabelText("Diseño")); // este trabajo no necesita Diseño
    fireEvent.click(screen.getByRole("button", { name: "Guardar trabajo" }));
    await waitFor(() => expect(onCreado).toHaveBeenCalledWith({ id: 5, codigo: "KT-0005" }));
    const { url, body } = enviados[0];
    expect(url).toBe("/api/trabajos/");
    expect(body).toMatchObject({ cliente: "Colegio", cantidad_total: 60, etapas: [1, 3], responsable: null, area_actual: null });
  });
});
