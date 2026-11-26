import { useState } from "react";
import { api } from "../api";
import { fmt, parseFecha } from "../lib/fechas.js";
import Select from "../components/Select.jsx";

export default function NuevoTrabajo({ cat, onCreado }) {
  const [f, setF] = useState({
    cliente: "",
    tipo_trabajo: "",
    cantidad_total: "1",
    descripcion: "",
    fecha: "",
    area_actual: "",
    responsable: "",
    observaciones: "",
  });
  const [etapas, setEtapas] = useState(cat.estados.map((e) => e.id));
  const [error, setError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const fecha = parseFecha(f.fecha);
  // La persona asignada debe ser del área del trabajo: se filtran las opciones y se mantienen coherentes.
  const delArea = (w, area) => !area || !w.area || String(w.area) === String(area);
  const cambiarArea = (v) =>
    setF((x) => ({
      ...x,
      area_actual: v,
      responsable: cat.trabajadores.some((w) => String(w.id) === String(x.responsable) && delArea(w, v)) ? x.responsable : "",
    }));
  const cambiarResponsable = (v) =>
    setF((x) => ({ ...x, responsable: v, area_actual: x.area_actual || (cat.trabajadores.find((w) => String(w.id) === v)?.area ?? "") }));

  const enviar = async (e) => {
    e.preventDefault();
    if (fecha === undefined) return setError("Fecha no válida. Escribe 20, 20/12 o 20/12/2026.");
    if (etapas.length < 2) return setError("Elige al menos 2 etapas.");
    try {
      const { fecha: _, ...resto } = f;
      onCreado(
        await api("/trabajos/", {
          method: "POST",
          body: {
            ...resto,
            cantidad_total: Number(f.cantidad_total),
            etapas,
            area_actual: f.area_actual || null,
            responsable: f.responsable ? Number(f.responsable) : null,
            fecha_comprometida: fecha,
          },
        }),
      );
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form className="panel grid" onSubmit={enviar}>
      <label>
        Cliente
        <input value={f.cliente} onChange={set("cliente")} required maxLength={120} />
      </label>
      <label>
        Tipo de trabajo
        <input value={f.tipo_trabajo} onChange={set("tipo_trabajo")} required maxLength={60} placeholder="Bordado, sublimación…" />
      </label>
      <label>
        Cantidad de unidades
        <input type="number" min="1" value={f.cantidad_total} onChange={set("cantidad_total")} required />
      </label>
      <label>
        Fecha de entrega
        <input value={f.fecha} onChange={set("fecha")} placeholder="20, 20/12 o 20/12/2026" inputMode="numeric" />
        <span className="ayuda">{f.fecha && (fecha ? `Se guardará: ${fmt(fecha)}` : fecha === undefined ? "Fecha no válida" : "")}</span>
      </label>
      <label className="ancho">
        Descripción
        <textarea value={f.descripcion} onChange={set("descripcion")} required rows={2} />
      </label>
      <label>
        Área inicial
        <Select valor={f.area_actual} vacio="Sin asignar" opciones={cat.areas} onChange={cambiarArea} />
      </label>
      <label>
        Asignar a
        <Select
          valor={f.responsable}
          vacio="Sin asignar"
          opciones={cat.trabajadores.filter((w) => delArea(w, f.area_actual))}
          onChange={cambiarResponsable}
        />
        <span className="ayuda">Solo aparecen las personas del área elegida.</span>
      </label>
      <label>
        Observaciones
        <input value={f.observaciones} onChange={set("observaciones")} />
      </label>
      <fieldset className="ancho etapas">
        <legend>Etapas que necesita este trabajo</legend>
        {cat.estados.map((e) => (
          <label key={e.id} className="check">
            <input
              type="checkbox"
              checked={etapas.includes(e.id)}
              onChange={() => setEtapas((x) => (x.includes(e.id) ? x.filter((i) => i !== e.id) : [...x, e.id]))}
            />
            {e.nombre_estado}
          </label>
        ))}
        <span className="ayuda">Desmarca las que no se usan; por ejemplo, Diseño si el cliente trae su diseño listo.</span>
      </fieldset>
      {error && (
        <p className="msg error ancho" role="alert">
          {error}
        </p>
      )}
      <button className="ancho">Guardar trabajo</button>
    </form>
  );
}
