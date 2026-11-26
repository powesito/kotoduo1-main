import { useEffect, useState } from "react";
import { api } from "../api";
import { useDebounce } from "../hooks";

export default function Admin({ cat, puede, yo, recargar }) {
  return (
    <section>
      {puede.etapas && <Etapas recargar={recargar} />}
      {puede.admin && <Cuentas cat={cat} yo={yo} />}
      {puede.historial && <Historial />}
    </section>
  );
}

/* ---------- Cuentas ---------- */

function Cuentas({ cat, yo }) {
  const vacio = { username: "", first_name: "", password: "", rol: "", area: "" };
  const [usuarios, setUsuarios] = useState([]);
  const [f, setF] = useState(vacio);
  const [error, setError] = useState("");
  const cargar = () =>
    api("/usuarios/")
      .then(setUsuarios)
      .catch((e) => setError(e.message));
  useEffect(() => {
    cargar();
  }, []);

  const cambiar = async (u, cambios, confirmar) => {
    if (confirmar && !window.confirm(confirmar)) return false;
    try {
      await api(`/usuarios/${u.id}/`, { method: "PATCH", body: cambios });
      setError("");
      cargar();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };
  const crear = async (e) => {
    e.preventDefault();
    try {
      await api("/usuarios/", { method: "POST", body: { ...f, rol: f.rol || null, area: f.area || null } });
      setF(vacio);
      setError("");
      cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <h2>Cuentas</h2>
      {error && (
        <p className="msg error" role="alert">
          {error}
        </p>
      )}
      <form className="panel fila-form" onSubmit={crear}>
        <label>
          Usuario
          <input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required />
        </label>
        <label>
          Nombre
          <input value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} />
        </label>
        <label>
          Contraseña
          <input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" required />
        </label>
        <label>
          Rol
          <select value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value })} required>
            <option value="">Elegir rol</option>
            {cat.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre_rol}
              </option>
            ))}
          </select>
        </label>
        <label>
          Área
          <select value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}>
            <option value="">Sin área</option>
            {cat.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre_area}
              </option>
            ))}
          </select>
        </label>
        <button>Crear cuenta</button>
      </form>
      <ul className="lista">
        {usuarios.map((u) => (
          <FilaUsuario key={u.id} u={u} cat={cat} esYo={u.id === yo.id} cambiar={cambiar} />
        ))}
      </ul>
    </>
  );
}

function FilaUsuario({ u, cat, esYo, cambiar }) {
  const [abierta, setAbierta] = useState(false);
  const [pw, setPw] = useState("");
  const [ok, setOk] = useState("");
  const restablecer = async (e) => {
    e.preventDefault();
    if (await cambiar(u, { password: pw })) {
      setPw("");
      setAbierta(false);
      setOk("Contraseña restablecida.");
    }
  };
  return (
    <li className={"material usuario" + (u.is_active ? "" : " inactiva")}>
      <div>
        <b>{u.username}</b> <small>{[u.first_name, u.last_name].filter(Boolean).join(" ")}</small>
        <span className={"chip " + (u.is_active ? "bien" : "alerta")}>{u.is_active ? "Activa" : "Deshabilitada"}</span>
      </div>
      <div className="fila-form">
        <label>
          Rol
          <select value={u.rol ?? ""} onChange={(e) => cambiar(u, { rol: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Sin rol</option>
            {cat.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre_rol}
              </option>
            ))}
          </select>
        </label>
        <label>
          Área
          <select value={u.area ?? ""} onChange={(e) => cambiar(u, { area: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Sin área</option>
            {cat.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre_area}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="acciones">
        <button className="sec" onClick={() => setAbierta(!abierta)} aria-expanded={abierta}>
          Restablecer contraseña
        </button>
        {!esYo && (
          <button
            className="sec"
            onClick={() => cambiar(u, { is_active: !u.is_active }, `¿${u.is_active ? "Deshabilitar" : "Habilitar"} la cuenta de ${u.username}?`)}
          >
            {u.is_active ? "Deshabilitar" : "Habilitar"}
          </button>
        )}
      </div>
      {abierta && (
        <form className="fila-form fila-completa" onSubmit={restablecer}>
          <label>
            Nueva contraseña para {u.username}
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required minLength={8} />
          </label>
          <button>Guardar contraseña</button>
        </form>
      )}
      {ok && (
        <p className="msg ok fila-completa" role="status">
          {ok}
        </p>
      )}
    </li>
  );
}

/* ---------- Historial de cambios ---------- */

const ENTIDADES = ["Trabajo", "Material", "Etapa", "Usuario"];

function Historial() {
  const [f, setF] = useState({ entidad: "", q: "" });
  const q = useDebounce(f.q);
  const [d, setD] = useState(null); // { items, count, pagina }
  const [error, setError] = useState("");
  const params = (pagina) => {
    const p = new URLSearchParams({ page: pagina, tam: 30 });
    if (f.entidad) p.set("entidad", f.entidad);
    if (q) p.set("q", q);
    return p;
  };
  useEffect(() => {
    const ctl = new AbortController();
    api("/historial/?" + params(1), { signal: ctl.signal })
      .then((r) => {
        setD({ items: r.results, count: r.count, pagina: 1 });
        setError("");
      })
      .catch((e) => e.name !== "AbortError" && setError(e.message));
    return () => ctl.abort();
  }, [f.entidad, q]);
  const mas = () =>
    api("/historial/?" + params(d.pagina + 1))
      .then((r) => setD((x) => ({ items: [...x.items, ...r.results], count: r.count, pagina: x.pagina + 1 })))
      .catch((e) => setError(e.message));

  return (
    <>
      <h2>Historial de cambios</h2>
      <div className="filtros historial-filtros">
        <input
          type="search"
          aria-label="Buscar en el historial"
          placeholder="Buscar por detalle o usuario"
          value={f.q}
          onChange={(e) => setF({ ...f, q: e.target.value })}
        />
        <select aria-label="Tipo de registro" value={f.entidad} onChange={(e) => setF({ ...f, entidad: e.target.value })}>
          <option value="">Todo</option>
          {ENTIDADES.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
      {error && (
        <p className="msg error" role="alert">
          {error}
        </p>
      )}
      {d && !d.items.length && <p className="vacio">No hay cambios registrados con ese filtro.</p>}
      <ul className="hist">
        {d?.items.map((h) => (
          <li key={h.id}>
            <b>
              {h.accion} · {h.entidad}
            </b>
            <small>
              {new Date(h.fecha_hora).toLocaleString("es-CL")} · {h.usuario ?? "—"}
            </small>
            <span>{h.detalle_resumido}</span>
          </li>
        ))}
      </ul>
      {d && d.items.length < d.count && (
        <button className="sec mas" onClick={mas}>
          Mostrar más ({d.items.length} de {d.count})
        </button>
      )}
    </>
  );
}

/* ---------- Etapas de producción ---------- */

function Etapas({ recargar }) {
  const [lista, setLista] = useState([]);
  const [nueva, setNueva] = useState("");
  const [error, setError] = useState("");
  const cargar = () =>
    api("/etapas/")
      .then(setLista)
      .catch((e) => setError(e.message));
  useEffect(() => {
    cargar();
  }, []);

  const hacer = async (fn) => {
    try {
      await fn();
      setError("");
      await cargar();
      recargar();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  };
  const mover = (i, d) => {
    const ids = lista.map((e) => e.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    hacer(() => api("/etapas/ordenar/", { method: "POST", body: { ids } }));
  };
  const agregar = async (e) => {
    e.preventDefault();
    if (await hacer(() => api("/etapas/", { method: "POST", body: { nombre_estado: nueva } }))) setNueva("");
  };

  return (
    <>
      <h2>Etapas de producción</h2>
      <p className="ayuda">
        Cambiar un nombre actualiza todos los trabajos. Una etapa con unidades no se puede desactivar; muévelas antes. Cada trabajo elige qué etapas
        usa al registrarse.
      </p>
      {error && (
        <p className="msg error" role="alert">
          {error}
        </p>
      )}
      <ul className="lista">
        {lista.map((e, i) => (
          <FilaEtapa
            key={e.id}
            e={e}
            i={i}
            n={lista.length}
            onMover={mover}
            onGuardar={(nombre) => hacer(() => api(`/etapas/${e.id}/`, { method: "PATCH", body: { nombre_estado: nombre } }))}
            onActivo={() =>
              window.confirm(`¿${e.activo ? "Desactivar" : "Activar"} la etapa "${e.nombre_estado}"?`) &&
              hacer(() => api(`/etapas/${e.id}/`, { method: "PATCH", body: { activo: !e.activo } }))
            }
          />
        ))}
      </ul>
      <form className="panel fila-form" onSubmit={agregar}>
        <label>
          Nueva etapa
          <input value={nueva} maxLength={40} onChange={(e) => setNueva(e.target.value)} required placeholder="Empaque, Despacho…" />
        </label>
        <button>Agregar etapa</button>
      </form>
    </>
  );
}

function FilaEtapa({ e, i, n, onMover, onGuardar, onActivo }) {
  const [nombre, setNombre] = useState(e.nombre_estado);
  return (
    <li className={"material" + (e.activo ? "" : " inactiva")}>
      <input aria-label="Nombre de la etapa" value={nombre} maxLength={40} onChange={(x) => setNombre(x.target.value)} />
      <small>{e.activo ? `${e.en_uso} unidades en esta etapa` : "Desactivada"}</small>
      <div className="acciones">
        <button className="sec" disabled={i === 0} onClick={() => onMover(i, -1)}>
          Subir
        </button>
        <button className="sec" disabled={i === n - 1} onClick={() => onMover(i, 1)}>
          Bajar
        </button>
        <button disabled={!nombre.trim() || nombre === e.nombre_estado} onClick={() => onGuardar(nombre)}>
          Guardar nombre
        </button>
        <button className="sec" onClick={onActivo}>
          {e.activo ? "Desactivar" : "Activar"}
        </button>
      </div>
    </li>
  );
}
