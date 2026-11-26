import { useState } from "react";
import { api } from "../api";
import Logo from "../components/Logo.jsx";
import BotonTema from "../components/BotonTema.jsx";

export default function Login({ onEntrar, aviso }) {
  const [f, setF] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const enviar = async (e) => {
    e.preventDefault();
    setError("");
    try {
      onEntrar(await api("/auth/login/", { method: "POST", body: f }));
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <>
      <div className="login-tema">
        <BotonTema />
      </div>
      <form className="login" onSubmit={enviar}>
        <h1>
          <Logo />
        </h1>
        <p>Seguimiento de trabajos en producción</p>
        {aviso && (
          <p className="msg aviso" role="status">
            {aviso}
          </p>
        )}
        <label>
          Usuario
          <input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoComplete="username" required autoFocus />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={f.password}
            onChange={(e) => setF({ ...f, password: e.target.value })}
            autoComplete="current-password"
            required
          />
        </label>
        {error && (
          <p className="msg error" role="alert">
            {error}
          </p>
        )}
        <button>Iniciar sesión</button>
      </form>
    </>
  );
}
