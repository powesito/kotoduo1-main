import { useState } from "react";
import { api } from "../api";

// Una línea de movimiento de material. Quien puede administrar materiales (ADMIN y MATERIALES)
// la corrige o la elimina; la existencia del material se ajusta sola.
// mostrarMaterial: en el detalle de un trabajo · mostrarTrabajo: en la pestaña Materiales.
export default function Movimiento({ x, puede, trabajos, mostrarMaterial, mostrarTrabajo, onCambio }) {
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ cantidad: x.cantidad, observacion: x.observacion, trabajo: x.trabajo_id ?? "" });
  const [error, setError] = useState("");

  const guardar = async (e) => {
    e.preventDefault();
    try {
      const cuerpo = { cantidad: f.cantidad, observacion: f.observacion };
      if (trabajos) cuerpo.trabajo = f.trabajo ? Number(f.trabajo) : null;
      await api(`/movimientos/${x.id}/`, { method: "PATCH", body: cuerpo });
      setEditando(false);
      setError("");
      onCambio();
    } catch (err) {
      setError(err.message);
    }
  };
  const eliminar = async () => {
    if (!window.confirm("¿Eliminar este movimiento? La existencia del material se corregirá.")) return;
    try {
      await api(`/movimientos/${x.id}/`, { method: "DELETE" });
      onCambio();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <li>
      <b>
        {mostrarMaterial && `${x.material_nombre} · `}
        {x.tipo_movimiento === "ENTRADA" ? "Entrada" : "Salida"} de {x.cantidad} {x.unidad}
        {mostrarTrabajo && x.trabajo && ` · ${x.trabajo}`}
      </b>
      <small>
        {new Date(x.fecha_hora).toLocaleString("es-CL")} · {x.usuario}
      </small>
      {x.observacion && <span>{x.observacion}</span>}
      {error && (
        <span className="msg error" role="alert">
          {error}
        </span>
      )}
      {puede.material && !editando && (
        <span className="acciones">
          <button className="sec" onClick={() => setEditando(true)}>
            Editar
          </button>
          <button className="sec mal" onClick={eliminar}>
            Eliminar
          </button>
        </span>
      )}
      {editando && (
        <form className="fila-form" onSubmit={guardar}>
          <label>
            Cantidad ({x.unidad})
            <input type="number" min="0.01" step="0.01" value={f.cantidad} required onChange={(e) => setF({ ...f, cantidad: e.target.value })} />
          </label>
          {trabajos && (
            <label>
              Trabajo
              <select value={f.trabajo} onChange={(e) => setF({ ...f, trabajo: e.target.value })}>
                <option value="">Sin trabajo asociado</option>
                {trabajos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.codigo} · {t.cliente}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Observación
            <input value={f.observacion} maxLength={300} onChange={(e) => setF({ ...f, observacion: e.target.value })} />
          </label>
          <button>Guardar</button>
          <button type="button" className="sec" onClick={() => setEditando(false)}>
            Cancelar
          </button>
        </form>
      )}
    </li>
  );
}
