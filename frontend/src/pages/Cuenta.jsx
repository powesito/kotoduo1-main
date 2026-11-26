import { useState } from "react";
import { api } from "../api";

export default function Cuenta() {
  const vacio = { actual: "", nueva: "", repetir: "" };
  const [f, setF] = useState(vacio);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const enviar = async (e) => {
    e.preventDefault();
    if (f.nueva !== f.repetir) return setMsg({ ok: false, texto: "Las contraseñas nuevas no coinciden." });
    try {
      await api("/auth/password/", { method: "POST", body: { actual: f.actual, nueva: f.nueva } });
      setF(vacio);
      setMsg({ ok: true, texto: "Contraseña actualizada." });
    } catch (err) {
      setMsg({ ok: false, texto: err.message });
    }
  };

  return (
    <section className="estrecha">
      <h2>Cambiar mi contraseña</h2>
      <form className="panel grid" onSubmit={enviar}>
        <label className="ancho">
          Contraseña actual
          <input type="password" value={f.actual} onChange={set("actual")} autoComplete="current-password" required />
        </label>
        <label>
          Contraseña nueva
          <input type="password" value={f.nueva} onChange={set("nueva")} autoComplete="new-password" required minLength={8} />
        </label>
        <label>
          Repetir contraseña nueva
          <input type="password" value={f.repetir} onChange={set("repetir")} autoComplete="new-password" required />
        </label>
        <span className="ayuda ancho">Mínimo 8 caracteres; evita claves comunes o parecidas a tu usuario.</span>
        {msg && (
          <p className={"msg ancho " + (msg.ok ? "ok" : "error")} role="alert">
            {msg.texto}
          </p>
        )}
        <button className="ancho">Guardar contraseña</button>
      </form>
    </section>
  );
}
