import { useEffect, useState } from "react";
import { api } from "../api";
import Movimiento from "./Movimiento.jsx";

// Materiales usados en un trabajo: lista, total por material y registro de nuevos consumos.
export default function MaterialesTrabajo({ t, puede, refresco }) {
  const vacio = { material: "", tipo_movimiento: "SALIDA", cantidad: "", observacion: "" };
  const [items, setItems] = useState(null);
  const [materiales, setMateriales] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState(vacio);
  const [msg, setMsg] = useState(null);

  const cargar = () =>
    api(`/movimientos/?trabajo=${t.id}&tam=100`)
      .then((r) => setItems(r.results))
      .catch((e) => setMsg({ ok: false, texto: e.message }));
  useEffect(() => {
    cargar();
  }, [t.id, refresco]);
  useEffect(() => {
    if (abierto && !materiales.length)
      api("/materiales/")
        .then(setMateriales)
        .catch(() => {});
  }, [abierto]);

  const registrar = async (e) => {
    e.preventDefault();
    try {
      const { material, ...resto } = f;
      await api(`/materiales/${material}/movimiento/`, { method: "POST", body: { ...resto, trabajo: t.id } });
      setF({ ...vacio, tipo_movimiento: f.tipo_movimiento });
      setMsg({ ok: true, texto: "Movimiento registrado." });
      cargar();
    } catch (err) {
      setMsg({ ok: false, texto: err.message });
    }
  };

  // Total neto por material: salidas menos devoluciones (entradas ligadas al trabajo).
  const totales = {};
  (items ?? []).forEach((x) => {
    const k = `${x.material_nombre}|${x.unidad}`;
    totales[k] = (totales[k] ?? 0) + (x.tipo_movimiento === "SALIDA" ? 1 : -1) * Number(x.cantidad);
  });
  const puedeAgregar = puede.movimientos && !t.anulado;
  const elegido = materiales.find((m) => String(m.id) === String(f.material));

  return (
    <>
      {msg && (
        <p className={"msg " + (msg.ok ? "ok" : "error")} role="alert">
          {msg.texto}
        </p>
      )}
      {items && !items.length && <p className="vacio">Todavía no se registran materiales para este trabajo.</p>}
      {items?.length > 0 && (
        <>
          <p className="resumen">
            Total:{" "}
            {Object.entries(totales)
              .map(([k, n]) => `${k.split("|")[0]} ${+n.toFixed(2)} ${k.split("|")[1]}`)
              .join(" · ")}
          </p>
          <ul className="hist">
            {items.map((x) => (
              <Movimiento key={x.id} x={x} puede={puede} mostrarMaterial onCambio={cargar} />
            ))}
          </ul>
        </>
      )}
      {puedeAgregar && (
        <>
          <button className="sec" onClick={() => setAbierto(!abierto)} aria-expanded={abierto}>
            {abierto ? "Cancelar" : "Registrar material usado"}
          </button>
          {abierto && (
            <form className="grid" onSubmit={registrar}>
              <label className="ancho">
                Material
                <select value={f.material} required onChange={(e) => setF({ ...f, material: e.target.value })}>
                  <option value="">Elegir material</option>
                  {materiales.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre} (hay {m.existencia_actual} {m.unidad_medida})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tipo
                <select value={f.tipo_movimiento} onChange={(e) => setF({ ...f, tipo_movimiento: e.target.value })}>
                  <option value="SALIDA">Usado en el trabajo</option>
                  <option value="ENTRADA">Devuelto a bodega</option>
                </select>
              </label>
              <label>
                Cantidad {elegido && `(${elegido.unidad_medida})`}
                <input type="number" min="0.01" step="0.01" value={f.cantidad} required onChange={(e) => setF({ ...f, cantidad: e.target.value })} />
              </label>
              <label className="ancho">
                Observación
                <input value={f.observacion} maxLength={300} onChange={(e) => setF({ ...f, observacion: e.target.value })} />
              </label>
              <button className="ancho">Registrar</button>
            </form>
          )}
        </>
      )}
    </>
  );
}
