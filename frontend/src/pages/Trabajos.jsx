import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAutoRefresco, useDebounce } from "../hooks";
import { etapasDe } from "../lib/etapas.js";
import Hilo from "../components/Hilo.jsx";
import Plazo from "../components/Plazo.jsx";
import Select from "../components/Select.jsx";
import NuevoTrabajo from "./NuevoTrabajo.jsx";
import Detalle from "./Detalle.jsx";

const VISTAS = [
  { id: "curso", nombre: "En curso" },
  { id: "completados", nombre: "Finalizados" },
  { id: "anulados", nombre: "Anulados" },
  { id: "todos", nombre: "Todos" },
];
const ORDENES = [{ id: "entrega", nombre: "Entrega más próxima" }];
const INICIAL = { q: "", estado: "", area: "", responsable: "", ver: "curso", orden: "", extra: "" };
const TAM = 25;
const REFRESCO_MS = 45000; // la pantalla se actualiza sola cada 45 s
const MAX_PAGINAS_REFRESCO = 4; // tam máximo del servidor = 100

export default function Trabajos({ cat, puede, ruta, ir, yo }) {
  const selId = ruta[1] ?? "";
  const esTrab = yo.rol === "TRABAJADOR";
  const mio = String(yo.id);
  // El trabajador entra directo a "Mis trabajos", ordenados por fecha de entrega.
  const [f, setF] = useState(() => (esTrab ? { ...INICIAL, responsable: mio, orden: "entrega" } : INICIAL));
  const q = useDebounce(f.q); // no se consulta al servidor en cada tecla
  const [lista, setLista] = useState(null); // { items, count, pagina }
  const [resumen, setResumen] = useState(null);
  const [sel, setSel] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [version, setVersion] = useState(0);
  const [versionResumen, setVersionResumen] = useState(0);
  const [ultima, setUltima] = useState(null); // hora de la última actualización
  const [tick, setTick] = useState(0); // avisa al detalle que debe recargar su historial y materiales
  const clave = JSON.stringify([q, f.estado, f.area, f.responsable, f.orden, f.ver, f.extra, version]);
  const claveRef = useRef(clave);
  claveRef.current = clave;
  const listaRef = useRef(lista);
  listaRef.current = lista;
  const selRef = useRef(sel);
  selRef.current = sel;
  const queryResumen = /^(\d+|none)$/.test(f.responsable) ? `?responsable=${f.responsable}` : "";

  const params = (pagina) => {
    const p = new URLSearchParams({ page: pagina, tam: TAM });
    if (q) p.set("q", q);
    ["estado", "area", "responsable", "orden"].forEach((k) => f[k] && p.set(k, f[k]));
    if (f.extra) p.set(f.extra, "1");
    else p.set("ver", f.ver);
    return p;
  };

  // Al cambiar los filtros se cancela la consulta anterior: una respuesta lenta no pisa a una más nueva.
  useEffect(() => {
    const ctl = new AbortController();
    api("/trabajos/?" + params(1), { signal: ctl.signal })
      .then((d) => {
        setLista({ items: d.results, count: d.count, pagina: 1 });
        setError("");
      })
      .catch((e) => e.name !== "AbortError" && setError(e.message));
    return () => ctl.abort();
  }, [q, f.estado, f.area, f.responsable, f.orden, f.ver, f.extra, version]);

  useEffect(() => {
    api("/trabajos/resumen/" + queryResumen)
      .then(setResumen)
      .catch(() => {});
  }, [version, versionResumen, f.responsable]);

  useEffect(() => {
    if (!selId) return setSel(null);
    if (sel && String(sel.id) === selId) return;
    api(`/trabajos/${selId}/`)
      .then(setSel)
      .catch(() => {
        setSel(null);
        ir("trabajos");
      });
    window.scrollTo(0, 0);
  }, [selId]);

  const masResultados = async () => {
    try {
      const d = await api("/trabajos/?" + params(lista.pagina + 1));
      setLista((l) => ({ items: [...l.items, ...d.results], count: d.count, pagina: l.pagina + 1 }));
    } catch (e) {
      setError(e.message);
    }
  };
  const actualizado = (t) => {
    const antes = sel;
    setSel(t);
    setLista((l) => l && { ...l, items: l.items.map((x) => (x.id === t.id ? t : x)) });
    setVersionResumen((v) => v + 1);
    // Al terminarse un trabajo (o reabrirse) la lista salta a donde ahora corresponde.
    if (antes && !t.anulado && t.completado !== antes.completado) {
      if (t.completado) {
        setF((x) => ({ ...x, estado: "", extra: "", ver: "completados" }));
        setAviso(`¡${t.codigo} terminado! Pasó a Finalizados.`);
      } else {
        setF((x) => ({ ...x, extra: "", ver: "curso" }));
        setAviso(`${t.codigo} volvió a En curso.`);
      }
    }
  };
  // Actualización silenciosa: recarga lista, contadores y el trabajo abierto sin tocar lo que la persona esté escribiendo.
  const refrescar = async () => {
    const miClave = claveRef.current;
    try {
      const paginas = Math.min(listaRef.current?.pagina ?? 1, MAX_PAGINAS_REFRESCO);
      const p = params(1);
      p.set("tam", TAM * paginas);
      const [d, r, t] = await Promise.all([
        api("/trabajos/?" + p),
        api("/trabajos/resumen/" + queryResumen),
        selRef.current ? api(`/trabajos/${selRef.current.id}/`) : null,
      ]);
      if (claveRef.current !== miClave) return; // cambiaron los filtros mientras se consultaba
      setLista({ items: d.results, count: d.count, pagina: paginas });
      setResumen(r);
      if (t) setSel((x) => (x && x.id === t.id ? t : x));
      setTick((v) => v + 1);
      setUltima(new Date());
    } catch {
      /* sin conexión: se reintenta en el próximo ciclo */
    }
  };
  useAutoRefresco(refrescar, REFRESCO_MS);
  const usar = (cambio) => setF({ ...f, ...cambio });
  const activo = (extra, ver = "curso") => f.extra === extra && (extra !== "" || f.ver === ver);

  return (
    <div className={"dos" + (selId ? " con-sel" : "")}>
      <section>
        {resumen && (
          <div className="resumen-barra" role="group" aria-label="Resumen de trabajos">
            <button className={"sec" + (activo("") ? " activa" : "")} aria-pressed={activo("")} onClick={() => usar({ extra: "", ver: "curso" })}>
              En curso <b>{resumen.en_curso}</b>
            </button>
            <button
              className={"sec" + (activo("", "completados") ? " activa" : "")}
              aria-pressed={activo("", "completados")}
              onClick={() => usar({ extra: "", ver: "completados" })}
            >
              Finalizados <b>{resumen.finalizados}</b>
            </button>
            <button
              className={"sec mal" + (activo("atrasados") ? " activa" : "")}
              aria-pressed={activo("atrasados")}
              onClick={() => usar({ extra: "atrasados" })}
            >
              Atrasados <b>{resumen.atrasados}</b>
            </button>
            <button className={"sec" + (activo("vencen") ? " activa" : "")} aria-pressed={activo("vencen")} onClick={() => usar({ extra: "vencen" })}>
              Vencen hoy o mañana <b>{resumen.vencen_pronto}</b>
            </button>
          </div>
        )}
        {esTrab && (
          <div className="resumen-barra" role="group" aria-label="Qué trabajos ver">
            <button
              className={"sec" + (f.responsable === mio ? " activa" : "")}
              aria-pressed={f.responsable === mio}
              onClick={() => usar({ responsable: mio })}
            >
              Mis trabajos
            </button>
            <button
              className={"sec" + (f.responsable === "" ? " activa" : "")}
              aria-pressed={f.responsable === ""}
              onClick={() => usar({ responsable: "" })}
            >
              Todos
            </button>
          </div>
        )}
        <div className="busqueda">
          <input
            type="search"
            placeholder="Buscar por código o cliente"
            aria-label="Buscar"
            value={f.q}
            onChange={(e) => usar({ q: e.target.value })}
          />
          {puede.crear && <button onClick={() => setNuevo(!nuevo)}>{nuevo ? "Cancelar" : "Registrar trabajo"}</button>}
        </div>
        <details className="plegable mas-filtros">
          <summary>Más filtros</summary>
          <div className="filtros">
            <Select valor={f.estado} vacio="Todas las etapas" opciones={cat.estados} aria-label="Etapa" onChange={(estado) => usar({ estado })} />
            <Select valor={f.area} vacio="Todas las áreas" opciones={cat.areas} aria-label="Área" onChange={(area) => usar({ area })} />
            <Select
              valor={f.responsable}
              vacio="Todos los responsables"
              opciones={[{ id: "none", nombre: "Sin asignar" }, ...cat.trabajadores]}
              aria-label="Asignado a"
              onChange={(responsable) => usar({ responsable })}
            />
            <Select valor={f.extra ? "" : f.ver} opciones={VISTAS} aria-label="Mostrar" onChange={(ver) => usar({ ver, extra: "" })} />
            <Select valor={f.orden} vacio="Más recientes primero" opciones={ORDENES} aria-label="Orden" onChange={(orden) => usar({ orden })} />
          </div>
        </details>
        <p className="ayuda actualizado">
          Se actualiza sola cada {REFRESCO_MS / 1000} s.
          {ultima && ` Última vez: ${ultima.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}.`}{" "}
          <button className="sec" onClick={refrescar}>
            Actualizar ahora
          </button>
        </p>
        {aviso && (
          <p className="msg ok" role="status">
            {aviso}{" "}
            <button className="sec" onClick={() => setAviso("")}>
              Cerrar
            </button>
          </p>
        )}
        {nuevo && (
          <NuevoTrabajo
            cat={cat}
            onCreado={(t) => {
              setNuevo(false);
              setVersion((v) => v + 1);
              ir("trabajos", t.id);
            }}
          />
        )}
        {error && (
          <p className="msg error" role="alert">
            {error}{" "}
            <button className="sec" onClick={() => setVersion((v) => v + 1)}>
              Reintentar
            </button>
          </p>
        )}
        {lista && !lista.items.length && (
          <p className="vacio">
            {esTrab && f.responsable === mio ? "No tienes trabajos asignados por ahora." : "No se encontraron trabajos."}{" "}
            {esTrab && f.responsable === mio && (
              <button className="sec" onClick={() => usar({ responsable: "" })}>
                Ver todos los trabajos
              </button>
            )}
          </p>
        )}
        <ul className="lista">
          {lista?.items.map((t) => (
            <li key={t.id}>
              <button
                className={"fila" + (String(t.id) === selId ? " sel" : "") + (t.anulado ? " inactiva" : "")}
                onClick={() => ir("trabajos", t.id)}
              >
                <span className="cod">{t.codigo}</span>
                <span className="cli">
                  <b>{t.cliente}</b>
                  <br />
                  <small>
                    {t.cantidad_total} u. · {t.descripcion}
                  </small>
                  {!t.anulado && (
                    <>
                      <br />
                      <span className="chip etapa-lista">{t.completado ? "Finalizado" : t.estado_nombre}</span>
                    </>
                  )}
                </span>
                <Hilo estados={etapasDe(t, cat)} avance={t.avance} />
                <span className="area">
                  {t.area_nombre ?? "Sin área"}
                  <br />
                  <small>{t.proxima_actividad || "Sin próxima actividad"}</small>
                  <br />
                  <small className="asignado">{t.responsable_nombre ? `Asignado a ${t.responsable_nombre}` : "Sin asignar"}</small>
                  <br />
                  <Plazo t={t} />
                </span>
              </button>
            </li>
          ))}
        </ul>
        {lista && lista.items.length < lista.count && (
          <button className="sec mas" onClick={masResultados}>
            Mostrar más ({lista.items.length} de {lista.count})
          </button>
        )}
      </section>
      <aside>
        {sel ? (
          <Detalle key={sel.id} t={sel} cat={cat} puede={puede} alGuardar={actualizado} onVolver={() => ir("trabajos")} refresco={tick} />
        ) : selId ? (
          <p className="cargando">Cargando…</p>
        ) : (
          <p className="vacio">Elige un trabajo para ver su avance.</p>
        )}
      </aside>
    </div>
  );
}
