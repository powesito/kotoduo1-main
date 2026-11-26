import { useEffect, useState } from "react";
import { api } from "../api";
import Movimiento from "../components/Movimiento.jsx";

export default function Materiales({ puede }) {
  const [lista, setLista] = useState(null);
  const [trabajos, setTrabajos] = useState([]);
  const [error, setError] = useState("");
  const cargar = () =>
    api("/materiales/" + (puede.material ? "?todos=1" : ""))
      .then(setLista)
      .catch((e) => setError(e.message));
  useEffect(() => {
    cargar();
    if (puede.movimientos)
      api("/trabajos/opciones/")
        .then(setTrabajos)
        .catch(() => {});
  }, []);
  const bajos = lista?.filter((m) => m.activo && m.stock_bajo).length ?? 0;

  return (
    <section>
      {bajos > 0 && (
        <p className="msg error" role="status">
          {bajos} {bajos === 1 ? "material está" : "materiales están"} en o bajo el mínimo.
        </p>
      )}
      {error && (
        <p className="msg error" role="alert">
          {error}
        </p>
      )}
      {puede.material && <NuevoMaterial onCreado={cargar} />}
      {lista && !lista.length && <p className="vacio">Aún no hay materiales. Registra el primero.</p>}
      <ul className="lista">
        {lista?.map((m) => (
          <Fila key={m.id} m={m} puede={puede} trabajos={trabajos} onCambio={cargar} />
        ))}
      </ul>
    </section>
  );
}

function NuevoMaterial({ onCreado }) {
  const vacio = { nombre: "", unidad_medida: "", stock_minimo: "0" };
  const [f, setF] = useState(vacio);
  const [error, setError] = useState("");
  const enviar = async (e) => {
    e.preventDefault();
    try {
      await api("/materiales/", { method: "POST", body: f });
      setF(vacio);
      setError("");
      onCreado();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <form className="panel fila-form" onSubmit={enviar}>
      <label>
        Material
        <input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required />
      </label>
      <label>
        Unidad
        <input value={f.unidad_medida} onChange={(e) => setF({ ...f, unidad_medida: e.target.value })} required placeholder="m, conos…" />
      </label>
      <label>
        Mínimo
        <input type="number" min="0" step="0.01" value={f.stock_minimo} onChange={(e) => setF({ ...f, stock_minimo: e.target.value })} />
      </label>
      <button>Agregar material</button>
      {error && (
        <p className="msg error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function Fila({ m, puede, trabajos, onCambio }) {
  const vacio = { tipo_movimiento: "ENTRADA", cantidad: "", observacion: "", trabajo: "" };
  const [mov, setMov] = useState(vacio);
  const [panel, setPanel] = useState(""); // "" | "hist" | "editar"
  const [error, setError] = useState("");
  const enviar = async (e) => {
    e.preventDefault();
    try {
      await api(`/materiales/${m.id}/movimiento/`, {
        method: "POST",
        body: { ...mov, trabajo: mov.trabajo ? Number(mov.trabajo) : null },
      });
      setMov({ ...vacio, tipo_movimiento: mov.tipo_movimiento });
      setError("");
      onCambio();
    } catch (err) {
      setError(err.message);
    }
  };
  const alternarActivo = async () => {
    if (!window.confirm(`¿${m.activo ? "Desactivar" : "Activar"} "${m.nombre}"?`)) return;
    try {
      await api(`/materiales/${m.id}/`, { method: "PATCH", body: { activo: !m.activo } });
      setError("");
      onCambio();
    } catch (err) {
      setError(err.message);
    }
  };
  const eliminar = async () => {
    if (!window.confirm(`¿Eliminar "${m.nombre}" definitivamente? Esta acción no se puede deshacer.`)) return;
    try {
      await api(`/materiales/${m.id}/`, { method: "DELETE" });
      onCambio();
    } catch (err) {
      setError(err.message); // p. ej. "tiene movimientos registrados": se sugiere desactivarlo
    }
  };
  const [versionMov, setVersionMov] = useState(0);
  const abrir = (p) => setPanel(panel === p ? "" : p);

  return (
    <li className={"material" + (m.stock_bajo && m.activo ? " bajo" : "") + (m.activo ? "" : " inactiva")}>
      <div>
        <b>{m.nombre}</b>
        {m.activo ? (
          <span className={"chip " + (m.stock_bajo ? "alerta" : "bien")}>{m.stock_bajo ? "Stock bajo" : "Stock suficiente"}</span>
        ) : (
          <span className="chip alerta">Desactivado</span>
        )}
      </div>
      <div className="cant">
        <b>{m.existencia_actual}</b> {m.unidad_medida}
        <small>mínimo {m.stock_minimo}</small>
      </div>
      {puede.movimientos && m.activo && (
        <form className="mov" onSubmit={enviar}>
          <select aria-label="Tipo de movimiento" value={mov.tipo_movimiento} onChange={(e) => setMov({ ...mov, tipo_movimiento: e.target.value })}>
            <option value="ENTRADA">Entrada</option>
            <option value="SALIDA">Salida</option>
          </select>
          <input
            aria-label="Cantidad"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Cantidad"
            value={mov.cantidad}
            onChange={(e) => setMov({ ...mov, cantidad: e.target.value })}
            required
          />
          <select aria-label="Trabajo (opcional)" value={mov.trabajo} onChange={(e) => setMov({ ...mov, trabajo: e.target.value })}>
            <option value="">Sin trabajo asociado</option>
            {trabajos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.codigo} · {t.cliente}
              </option>
            ))}
          </select>
          <input
            aria-label="Observación"
            placeholder="Observación"
            value={mov.observacion}
            onChange={(e) => setMov({ ...mov, observacion: e.target.value })}
          />
          <button>Registrar movimiento</button>
        </form>
      )}
      {error && (
        <p className="msg error fila-completa" role="alert">
          {error}
        </p>
      )}
      <div className="acciones fila-completa">
        <button className="sec" onClick={() => abrir("hist")} aria-expanded={panel === "hist"}>
          Historial de movimientos
        </button>
        {puede.material && (
          <>
            <button className="sec" onClick={() => abrir("editar")} aria-expanded={panel === "editar"}>
              Editar
            </button>
            <button className="sec" onClick={alternarActivo}>
              {m.activo ? "Desactivar" : "Activar"}
            </button>
            <button className="sec mal" onClick={eliminar}>
              Eliminar
            </button>
          </>
        )}
      </div>
      {panel === "hist" && (
        <Movimientos
          id={m.id}
          puede={puede}
          trabajos={trabajos}
          version={versionMov}
          onCambio={() => {
            setVersionMov((v) => v + 1);
            onCambio(); // la existencia del material cambió
          }}
        />
      )}
      {panel === "editar" && (
        <EditarMaterial
          m={m}
          onGuardado={() => {
            setPanel("");
            onCambio();
          }}
        />
      )}
    </li>
  );
}

function EditarMaterial({ m, onGuardado }) {
  const [f, setF] = useState({ nombre: m.nombre, unidad_medida: m.unidad_medida, stock_minimo: m.stock_minimo });
  const [error, setError] = useState("");
  const enviar = async (e) => {
    e.preventDefault();
    try {
      await api(`/materiales/${m.id}/`, { method: "PATCH", body: f });
      onGuardado();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <form className="fila-form fila-completa" onSubmit={enviar}>
      <label>
        Nombre
        <input value={f.nombre} required onChange={(e) => setF({ ...f, nombre: e.target.value })} />
      </label>
      <label>
        Unidad
        <input value={f.unidad_medida} required onChange={(e) => setF({ ...f, unidad_medida: e.target.value })} />
      </label>
      <label>
        Stock mínimo
        <input type="number" min="0" step="0.01" value={f.stock_minimo} onChange={(e) => setF({ ...f, stock_minimo: e.target.value })} />
      </label>
      <button>Guardar</button>
      {error && (
        <p className="msg error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function Movimientos({ id, puede, trabajos, version, onCambio }) {
  const [d, setD] = useState(null); // { items, count, pagina }
  const [error, setError] = useState("");
  const pedir = (pagina) => api(`/materiales/${id}/movimientos/?page=${pagina}&tam=10`);
  useEffect(() => {
    pedir(1)
      .then((r) => setD({ items: r.results, count: r.count, pagina: 1 }))
      .catch((e) => setError(e.message));
  }, [id, version]);
  const mas = () =>
    pedir(d.pagina + 1)
      .then((r) => setD((x) => ({ items: [...x.items, ...r.results], count: r.count, pagina: x.pagina + 1 })))
      .catch((e) => setError(e.message));
  return (
    <div className="fila-completa">
      {error && (
        <p className="msg error" role="alert">
          {error}
        </p>
      )}
      {d && !d.items.length && <p className="vacio">Todavía no hay movimientos.</p>}
      <ul className="hist">
        {d?.items.map((x) => (
          <Movimiento key={x.id} x={x} puede={puede} trabajos={puede.material ? trabajos : undefined} mostrarTrabajo onCambio={onCambio} />
        ))}
      </ul>
      {d && d.items.length < d.count && (
        <button className="sec" onClick={mas}>
          Mostrar más ({d.items.length} de {d.count})
        </button>
      )}
    </div>
  );
}
