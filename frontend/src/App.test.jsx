import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App.jsx";

const estados = [
  { id: 1, nombre_estado: "Recibido", orden: 0 },
  { id: 2, nombre_estado: "Diseño", orden: 1 },
  { id: 3, nombre_estado: "Entregado", orden: 2 },
];
const trabajo = (id, extra = {}) => ({
  id,
  codigo: `KT-000${id}`,
  cliente: `Cliente ${id}`,
  descripcion: "Buzos",
  tipo_trabajo: "Bordado",
  cantidad_total: 10,
  fecha_ingreso: "2026-11-01",
  fecha_comprometida: "2026-11-25",
  estado: 1,
  estado_nombre: "Recibido",
  area_actual: 1,
  area_nombre: "Bordado",
  responsable: 7,
  responsable_nombre: "Ana Soto",
  proxima_actividad: "Bordar",
  observaciones: "",
  avance: { 1: 10 },
  etapas: [1, 2, 3],
  entregadas: 0,
  completado: false,
  anulado: false,
  motivo_anulacion: "",
  dias_para_entrega: 5,
  ...extra,
});
const trabajos = [trabajo(1, { dias_para_entrega: -3 }), trabajo(2, { responsable: null, responsable_nombre: null })];
// Los permisos los define el servidor (/auth/me/); aquí se simulan.
const todos = { crear: true, editar: true, seguimiento: true, movimientos: true, material: true, admin: true, historial: true, etapas: true };
const usuario = { id: 1, username: "admin", nombre: "Admin", rol: "ADMIN", area: null, permisos: todos };
const movimiento = {
  id: 1,
  material: 1,
  material_nombre: "Hilo negro",
  unidad: "conos",
  tipo_movimiento: "SALIDA",
  cantidad: "3.00",
  fecha_hora: "2026-11-02T10:00:00Z",
  usuario: "mat",
  observacion: "",
  trabajo: "KT-0001",
  trabajo_id: 1,
};

let llamadas = [];
// Servidor simulado: cada ruta devuelve [estado, datos]; se anotan las URL pedidas.
function simular(rutas) {
  llamadas = [];
  vi.stubGlobal("fetch", (url) => {
    llamadas.push(url);
    // gana la ruta más específica (la de prefijo más largo)
    const ruta = Object.keys(rutas)
      .filter((r) => url.replace(/^\/api/, "").startsWith(r))
      .sort((x, y) => y.length - x.length)[0];
    const [status, datos] = ruta ? rutas[ruta] : [404, { detail: "No encontrado" }];
    return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(datos) });
  });
}
const base = {
  "/auth/csrf/": [200, { ok: true }],
  "/auth/me/": [200, usuario],
  "/catalogos/": [
    200,
    {
      estados,
      areas: [{ id: 1, nombre_area: "Bordado" }],
      roles: [],
      trabajadores: [{ id: 7, nombre: "Ana Soto", area: 1 }],
    },
  ],
  "/trabajos/resumen/": [200, { en_curso: 2, finalizados: 4, atrasados: 1, vencen_pronto: 0 }],
  "/trabajos/1/historial/": [
    200,
    [
      {
        id: 1,
        tipo: "REGISTRO",
        usuario: "admin",
        estado_anterior: null,
        estado_nuevo: "Recibido",
        fecha_hora: "2026-11-01T10:00:00Z",
        observacion: "Trabajo registrado",
      },
    ],
  ],
  "/movimientos/": [200, { count: 1, results: [movimiento] }],
  "/materiales/": [200, []],
  "/trabajos/1/": [200, trabajos[0]],
  "/trabajos/?": [200, { count: 2, results: trabajos }],
};

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.tema;
  window.scrollTo = () => {};
  location.hash = "";
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("muestra la lista con el resumen, el atraso y a quién está asignado cada trabajo", async () => {
    simular(base);
    render(<App />);
    expect(await screen.findByText("KT-0001")).toBeTruthy();
    expect(screen.getByText("Atrasado 3 días")).toBeTruthy();
    expect(screen.getByText("Atrasados").closest("button").textContent).toContain("1");
    expect(screen.getByRole("button", { name: /Finalizados/ }).textContent).toContain("4");
    expect(screen.getByText("Vencen hoy o mañana")).toBeTruthy();
    expect(screen.getByText("Asignado a Ana Soto")).toBeTruthy();
    expect(screen.getByText("Sin asignar", { selector: "small" })).toBeTruthy();
  });

  it("abre el detalle desde la URL, con responsable, materiales usados y edición", async () => {
    location.hash = "#/trabajos/1";
    simular(base);
    render(<App />);
    expect(await screen.findByText("Editar datos del trabajo")).toBeTruthy();
    expect(screen.getByText("Anular trabajo", { selector: "summary" })).toBeTruthy();
    expect(await screen.findByText("Registrado")).toBeTruthy();
    expect(screen.getAllByText("Ana Soto").length).toBeGreaterThan(0); // "Asignado a" en el detalle
    expect(await screen.findByText(/Hilo negro · Salida de 3.00 conos/)).toBeTruthy();
    expect(screen.getByText("Materiales usados")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeTruthy(); // ADMIN corrige o elimina movimientos
  });

  it("un trabajo sin etapas activas no deja la pantalla en blanco", async () => {
    location.hash = "#/trabajos/1";
    simular({ ...base, "/trabajos/1/": [200, trabajo(1, { etapas: [99], avance: {} })] });
    render(<App />);
    expect(await screen.findByText(/no tiene etapas activas/)).toBeTruthy();
  });

  it("al terminar un trabajo la lista salta a Finalizados y lo avisa", async () => {
    location.hash = "#/trabajos/1";
    const terminado = trabajo(1, { avance: { 3: 10 }, entregadas: 10, completado: true, dias_para_entrega: null });
    simular({ "/trabajos/1/avanzar/": [200, terminado], ...base }); // la ruta más específica va primero
    render(<App />);
    fireEvent.change(await screen.findByLabelText(/Cantidad \(máx\. 10\)/), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Mover unidades" }));
    expect(await screen.findByText(/KT-0001 terminado! Pasó a Finalizados/)).toBeTruthy();
    await waitFor(() => expect(llamadas.some((u) => u.includes("ver=completados"))).toBe(true));
    expect(await screen.findByText(/Trabajo finalizado/)).toBeTruthy();
  });

  it("en Materiales se puede eliminar y, si tiene movimientos, avisa y sugiere desactivar", async () => {
    location.hash = "#/materiales";
    window.confirm = () => true;
    const material = {
      id: 1,
      nombre: "Hilo negro",
      unidad_medida: "conos",
      existencia_actual: "12.00",
      stock_minimo: "5.00",
      activo: true,
      stock_bajo: false,
    };
    simular({
      ...base,
      "/materiales/": [200, [material]],
      "/materiales/1/": [400, { detail: "Este material tiene movimientos registrados y no se puede eliminar. Puedes desactivarlo." }],
    });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar" }));
    expect(await screen.findByText(/no se puede eliminar/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Desactivar" })).toBeTruthy();
  });

  it("el botón de tema alterna claro/oscuro y recuerda la elección", async () => {
    simular(base);
    render(<App />);
    await screen.findByText("KT-0001");
    fireEvent.click(screen.getByRole("button", { name: /Tema oscuro/ }));
    expect(document.documentElement.dataset.tema).toBe("oscuro");
    expect(localStorage.getItem("kotoduo-tema")).toBe("oscuro");
    fireEvent.click(screen.getByRole("button", { name: /Tema claro/ }));
    expect(document.documentElement.dataset.tema).toBe("claro");
    expect(localStorage.getItem("kotoduo-tema")).toBe("claro");
  });

  it("el logo de Kotoduo está en la barra, a la izquierda, y enlaza a Trabajos", async () => {
    simular(base);
    render(<App />);
    await screen.findByText("KT-0001");
    const enlace = screen.getByRole("link", { name: /Kotoduo: ir a Trabajos/ });
    expect(enlace.querySelectorAll("img").length).toBe(2); // versión clara y oscura
    expect(document.querySelector("header").firstElementChild).toBe(enlace);
  });

  it("el trabajador entra a «Mis trabajos» ordenados por entrega y puede cambiar a Todos", async () => {
    simular({
      ...base,
      "/auth/me/": [
        200,
        {
          id: 4,
          username: "trab",
          nombre: "Trab",
          rol: "TRABAJADOR",
          area: 1,
          permisos: { ...Object.fromEntries(Object.keys(todos).map((k) => [k, false])), seguimiento: true },
        },
      ],
    });
    render(<App />);
    await screen.findByText("KT-0001");
    expect(llamadas.some((u) => u.includes("/trabajos/?") && u.includes("responsable=4") && u.includes("orden=entrega"))).toBe(true);
    expect(llamadas.some((u) => u.includes("/trabajos/resumen/?responsable=4"))).toBe(true); // los contadores también son los suyos
    expect(screen.getByRole("button", { name: "Mis trabajos" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: "Registrar trabajo" })).toBeNull();
    llamadas.length = 0;
    fireEvent.click(screen.getByRole("button", { name: "Todos" }));
    await waitFor(() => expect(llamadas.some((u) => u.startsWith("/api/trabajos/?") && !u.includes("responsable="))).toBe(true));
  });

  it("el detalle muestra en grande la etapa actual y las unidades", async () => {
    location.hash = "#/trabajos/1";
    simular(base);
    render(<App />);
    expect(await screen.findByText("Etapa actual")).toBeTruthy();
    expect(screen.getByText("Recibido", { selector: ".etapa-nombre" })).toBeTruthy();
    expect(screen.getByText("10 de 10 unidades")).toBeTruthy();
    expect(screen.getByText("0 de 10 unidades finalizadas")).toBeTruthy();
  });

  it("la lista se actualiza sola, sin recargar la página", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const lista = { count: 2, results: trabajos };
    simular({ ...base, "/trabajos/?": [200, lista] });
    render(<App />);
    expect(await screen.findByText("Cliente 1")).toBeTruthy();
    lista.results = [trabajo(1, { cliente: "Cliente Nuevo" }), trabajos[1]]; // alguien más lo cambió
    await vi.advanceTimersByTimeAsync(46000);
    expect(await screen.findByText("Cliente Nuevo")).toBeTruthy();
    expect(screen.getByText(/Última vez:/)).toBeTruthy();
  });

  it("si la sesión caduca vuelve al login con un aviso", async () => {
    simular({ ...base, "/trabajos/?": [401, { detail: "Las credenciales de autenticación no se proveyeron." }] });
    render(<App />);
    await waitFor(() => expect(screen.getByText("Tu sesión expiró. Vuelve a iniciar sesión.")).toBeTruthy());
    expect(screen.getByText("Iniciar sesión")).toBeTruthy();
  });

  it("sin sesión muestra el login", async () => {
    simular({ ...base, "/auth/me/": [401, { detail: "x" }] });
    render(<App />);
    expect(await screen.findByText("Iniciar sesión")).toBeTruthy();
  });
});
