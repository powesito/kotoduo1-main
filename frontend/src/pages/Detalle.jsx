import { useEffect, useState } from "react";
import { api } from "../api";
import { etapasDe } from "../lib/etapas.js";
import { fmt, parseFecha } from "../lib/fechas.js";
import Plazo from "../components/Plazo.jsx";
import Select from "../components/Select.jsx";
import MaterialesTrabajo from "../components/MaterialesTrabajo.jsx";
import EtapaActual from "../components/EtapaActual.jsx";

const TITULOS = { REGISTRO: "Registrado", SEGUIMIENTO: "Seguimiento", EDICION: "Edición", ANULACION: "Anulación / restauración" };
const tituloHistorial = (h) =>
  TITULOS[h.tipo] ?? (h.estado_anterior && h.estado_anterior !== h.estado_nuevo ? `${h.estado_anterior} → ${h.estado_nuevo}` : h.estado_nuevo);

export default function Detalle({ t, cat, puede, alGuardar, onVolver, refresco = 0 }) {
  const est = etapasDe(t, cat);
  const ultima = est[est.length - 1];
  const origenes = est.filter((e) => (t.avance[e.id] ?? 0) > 0 && e.id !== ultima?.id);
  const [f, setF] = useState({
    area_actual: t.area_actual ?? "",
    responsable: t.responsable ?? "",
    proxima_actividad: t.proxima_actividad,
    observacion: "",
  });
  const [m, setM] = useState({ desde: "", cantidad: "", hacia: "" });
  const [ed, setEd] = useState({
    cliente: t.cliente,
    tipo_trabajo: t.tipo_trabajo,
    cantidad_total: String(t.cantidad_total),
    fecha: fmt(t.fecha_comprometida),
    descripcion: t.descripcion,
    observaciones: t.observaciones,
  });
  const [motivo, setMotivo] = useState("");
  const [hist, setHist] = useState([]);
  const [msg, setMsg] = useState(null);
  const desde = origenes.some((e) => String(e.id) === String(m.desde)) ? m.desde : (origenes[0]?.id ?? "");
  const disponibles = t.avance[desde] ?? 0;
  const fechaEd = parseFecha(ed.fecha);
  const cargarHist = () =>
    api(`/trabajos/${t.id}/historial/`)
      .then(setHist)
      .catch(() => {});
  useEffect(() => {
    cargarHist();
  }, [refresco]); // también al actualizarse solo la pantalla

  const enviar =
    (ruta, body, ok, despues, method = "POST") =>
    async (e) => {
      e.preventDefault();
      setMsg(null);
      try {
        alGuardar(await api(`/trabajos/${t.id}/${ruta ? ruta + "/" : ""}`, { method, body }));
        despues?.();
        cargarHist();
        setMsg({ ok: true, texto: ok });
      } catch (err) {
        setMsg({ ok: false, texto: err.message });
      }
    };

  // Solo Coordinación/Administración asignan responsables; el resto envía únicamente área y próxima actividad.
  const { responsable, ...restoF } = f;
  const cuerpoSeguimiento = {
    ...restoF,
    area_actual: f.area_actual === "" ? null : Number(f.area_actual),
    ...(puede.editar ? { responsable: responsable === "" ? null : Number(responsable) } : {}),
  };
  const guardar = enviar("seguimiento", cuerpoSeguimiento, "Seguimiento guardado.", () => setF((x) => ({ ...x, observacion: "" })));
  // La persona asignada debe ser del área del trabajo: se filtran las opciones y se mantienen coherentes.
  const delArea = (w, area) => !area || !w.area || String(w.area) === String(area);
  const trabajadores = cat.trabajadores.filter((w) => delArea(w, f.area_actual));
  const cambiarArea = (v) =>
    setF((x) => ({
      ...x,
      area_actual: v,
      responsable: cat.trabajadores.some((w) => String(w.id) === String(x.responsable) && delArea(w, v)) ? x.responsable : "",
    }));
  const cambiarResponsable = (v) =>
    setF((x) => ({ ...x, responsable: v, area_actual: x.area_actual || (cat.trabajadores.find((w) => String(w.id) === v)?.area ?? "") }));
  const mover = enviar(
    "avanzar",
    { desde: Number(desde), cantidad: Number(m.cantidad), ...(m.hacia ? { hacia: Number(m.hacia) } : {}) },
    "Unidades movidas.",
    () => setM({ desde: "", cantidad: "", hacia: "" }),
  );
  const editar = (e) => {
    if (fechaEd === undefined) {
      e.preventDefault();
      return setMsg({ ok: false, texto: "Fecha no válida. Escribe 20, 20/12 o 20/12/2026." });
    }
    const { fecha, ...resto } = ed;
    return enviar("", { ...resto, cantidad_total: Number(ed.cantidad_total), fecha_comprometida: fechaEd }, "Cambios guardados.", null, "PATCH")(e);
  };
  const anular = (e) => {
    e.preventDefault();
    if (!window.confirm(`¿Anular el trabajo ${t.codigo}? Podrás restaurarlo después.`)) return;
    enviar("anular", { motivo }, "Trabajo anulado.", () => setMotivo(""))(e);
  };
  const restaurar = (e) => enviar("restaurar", {}, "Trabajo restaurado.")(e);

  return (
    <div className="panel">
      <button className="sec volver" onClick={onVolver}>
        ← Volver a la lista
      </button>
      <h2>
        {t.codigo} · {t.cliente} <Plazo t={t} />
      </h2>
      {t.anulado && (
        <p className="msg error" role="status">
          Anulado: {t.motivo_anulacion}{" "}
          {puede.editar && (
            <button className="sec" onClick={restaurar}>
              Restaurar
            </button>
          )}
        </p>
      )}
      {t.completado && !t.anulado && (
        <p className="msg ok" role="status">
          ✔ Trabajo finalizado: todas las unidades están en la última etapa.
        </p>
      )}
      <p>{t.descripcion}</p>
      <EtapaActual t={t} est={est} />
      <p className="meta">
        <span className="asignado">{t.responsable_nombre ? `Asignado a ${t.responsable_nombre}` : "Sin asignar"}</span>
        {t.proxima_actividad && <> · Próxima actividad: {t.proxima_actividad}</>}
      </p>
      {msg && (
        <p className={"msg " + (msg.ok ? "ok" : "error")} role="alert">
          {msg.texto}
        </p>
      )}
      <details className="plegable">
        <summary>Datos del trabajo</summary>
        <dl>
          <dt>Tipo</dt>
          <dd>{t.tipo_trabajo}</dd>
          <dt>Área</dt>
          <dd>{t.area_nombre ?? "Sin asignar"}</dd>
          <dt>Asignado a</dt>
          <dd>{t.responsable_nombre ?? "Sin asignar"}</dd>
          <dt>Próxima actividad</dt>
          <dd>{t.proxima_actividad || "Sin definir"}</dd>
          <dt>Ingreso</dt>
          <dd>{fmt(t.fecha_ingreso)}</dd>
          {t.fecha_comprometida && (
            <>
              <dt>Entrega</dt>
              <dd>{fmt(t.fecha_comprometida)}</dd>
            </>
          )}
          {t.observaciones && (
            <>
              <dt>Observaciones</dt>
              <dd>{t.observaciones}</dd>
            </>
          )}
        </dl>
      </details>
      {puede.seguimiento && !t.anulado && origenes.length > 0 && (
        <details className="plegable" open>
          <summary>Mover unidades a la siguiente etapa</summary>
          <form className="grid" onSubmit={mover}>
            <label>
              Desde
              <Select valor={desde} opciones={origenes} onChange={(v) => setM({ ...m, desde: v })} />
            </label>
            <label>
              Cantidad (máx. {disponibles})
              <input type="number" min="1" max={disponibles} value={m.cantidad} onChange={(e) => setM({ ...m, cantidad: e.target.value })} required />
            </label>
            <label className="ancho">
              Hacia
              <Select
                valor={m.hacia}
                vacio="Siguiente etapa"
                opciones={est.filter((e) => String(e.id) !== String(desde))}
                onChange={(v) => setM({ ...m, hacia: v })}
              />
            </label>
            <button className="ancho">Mover unidades</button>
          </form>
        </details>
      )}
      {puede.seguimiento && !t.anulado && (
        <details className="plegable">
          <summary>Área, responsable y próxima actividad</summary>
          <form className="grid" onSubmit={guardar}>
            <label className="ancho">
              Área responsable
              <Select valor={f.area_actual} vacio="Sin asignar" opciones={cat.areas} onChange={cambiarArea} />
            </label>
            {puede.editar && (
              <label className="ancho">
                Asignado a
                <Select valor={f.responsable} vacio="Sin asignar" opciones={trabajadores} onChange={cambiarResponsable} />
                <span className="ayuda">Solo aparecen las personas del área elegida.</span>
              </label>
            )}
            <label className="ancho">
              Próxima actividad
              <input value={f.proxima_actividad} maxLength={200} onChange={(e) => setF({ ...f, proxima_actividad: e.target.value })} />
            </label>
            <label className="ancho">
              Observación
              <input value={f.observacion} maxLength={300} onChange={(e) => setF({ ...f, observacion: e.target.value })} />
            </label>
            <button className="ancho sec">Guardar seguimiento</button>
          </form>
        </details>
      )}
      {puede.editar && !t.anulado && (
        <>
          <details className="plegable">
            <summary>Editar datos del trabajo</summary>
            <form className="grid" onSubmit={editar}>
              <label>
                Cliente
                <input value={ed.cliente} maxLength={120} required onChange={(e) => setEd({ ...ed, cliente: e.target.value })} />
              </label>
              <label>
                Tipo de trabajo
                <input value={ed.tipo_trabajo} maxLength={60} required onChange={(e) => setEd({ ...ed, tipo_trabajo: e.target.value })} />
              </label>
              <label>
                Cantidad de unidades
                <input type="number" min="1" value={ed.cantidad_total} required onChange={(e) => setEd({ ...ed, cantidad_total: e.target.value })} />
                <span className="ayuda">Las unidades nuevas entran a la primera etapa. Solo se pueden quitar las que siguen allí.</span>
              </label>
              <label>
                Fecha de entrega
                <input
                  value={ed.fecha}
                  placeholder="20, 20/12 o 20/12/2026"
                  inputMode="numeric"
                  onChange={(e) => setEd({ ...ed, fecha: e.target.value })}
                />
                <span className="ayuda">
                  {ed.fecha && (fechaEd ? `Se guardará: ${fmt(fechaEd)}` : fechaEd === undefined ? "Fecha no válida" : "")}
                </span>
              </label>
              <label className="ancho">
                Descripción
                <textarea rows={2} value={ed.descripcion} required onChange={(e) => setEd({ ...ed, descripcion: e.target.value })} />
              </label>
              <label className="ancho">
                Observaciones
                <input value={ed.observaciones} onChange={(e) => setEd({ ...ed, observaciones: e.target.value })} />
              </label>
              <button className="ancho">Guardar cambios</button>
            </form>
          </details>
          <details className="plegable">
            <summary>Anular trabajo</summary>
            <form className="grid" onSubmit={anular}>
              <label className="ancho">
                Motivo (obligatorio)
                <input
                  value={motivo}
                  maxLength={300}
                  required
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Cliente canceló, error de registro…"
                />
              </label>
              <button className="ancho sec mal">Anular trabajo</button>
            </form>
          </details>
        </>
      )}
      <details className="plegable">
        <summary>Materiales usados</summary>
        <MaterialesTrabajo t={t} puede={puede} refresco={refresco} />
      </details>
      <details className="plegable">
        <summary>Historial</summary>
        <ul className="hist">
          {hist.map((h) => (
            <li key={h.id}>
              <b>{tituloHistorial(h)}</b>
              <small>
                {new Date(h.fecha_hora).toLocaleString("es-CL")} · {h.usuario}
              </small>
              {h.observacion && <span>{h.observacion}</span>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
