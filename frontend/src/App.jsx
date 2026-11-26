import { useEffect, useState } from "react";
import { alSesionExpirada, api } from "./api";
import { useRuta } from "./hash";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import Login from "./pages/Login.jsx";
import Trabajos from "./pages/Trabajos.jsx";
import Materiales from "./pages/Materiales.jsx";
import Admin from "./pages/Admin.jsx";
import Cuenta from "./pages/Cuenta.jsx";
import Logo from "./components/Logo.jsx";
import BotonTema from "./components/BotonTema.jsx";

export default function App() {
  const [user, setUser] = useState(undefined);
  const [cat, setCat] = useState(null);
  const [aviso, setAviso] = useState("");
  const [errorCat, setErrorCat] = useState("");
  const [ruta, ir] = useRuta();

  useEffect(() => {
    alSesionExpirada(() => {
      setUser(null);
      setCat(null);
      setAviso("Tu sesión expiró. Vuelve a iniciar sesión.");
    });
    api("/auth/csrf/")
      .then(() => api("/auth/me/"))
      .then(setUser)
      .catch(() => setUser(null));
  }, []);
  useEffect(() => {
    if (user)
      api("/catalogos/")
        .then(setCat)
        .catch((e) => setErrorCat(e.message));
  }, [user]);

  if (user === undefined) return <p className="cargando">Cargando…</p>;
  if (!user)
    return (
      <Login
        aviso={aviso}
        onEntrar={(u) => {
          setAviso("");
          setUser(u);
        }}
      />
    );

  // La interfaz solo oculta opciones; el servidor valida cada permiso y es quien los define (SEG-01).
  const puede = user.permisos ?? {};
  const salir = () =>
    api("/auth/logout/", { method: "POST" }).finally(() => {
      setUser(null);
      setCat(null);
      setAviso("");
      ir();
    });
  const tabs = [
    ["trabajos", "Trabajos"],
    ["materiales", "Materiales"],
    ...(puede.admin || puede.historial ? [["admin", "Administración"]] : []),
    ["cuenta", "Mi cuenta"],
  ];
  const vista = tabs.some(([k]) => k === ruta[0]) ? ruta[0] : "trabajos";

  const contenido = () => {
    if (errorCat)
      return (
        <p className="msg error" role="alert">
          {errorCat}
        </p>
      );
    if (!cat) return <p className="cargando">Cargando…</p>;
    if (vista === "trabajos") return <Trabajos cat={cat} puede={puede} ruta={ruta} ir={ir} yo={user} />;
    if (vista === "materiales") return <Materiales puede={puede} />;
    if (vista === "cuenta") return <Cuenta />;
    return <Admin cat={cat} puede={puede} yo={user} recargar={() => api("/catalogos/").then(setCat)} />;
  };

  return (
    <>
      <header className="barra">
        <a className="marca" href="#/trabajos" aria-label="Kotoduo: ir a Trabajos">
          <Logo />
        </a>
        <nav aria-label="Secciones">
          {tabs.map(([k, t]) => (
            <button key={k} className={"tab" + (vista === k ? " activa" : "")} aria-current={vista === k ? "page" : undefined} onClick={() => ir(k)}>
              {t}
            </button>
          ))}
        </nav>
        <span className="sesion">
          {user.nombre} <small>({user.rol ?? "sin rol"})</small>
        </span>
        <BotonTema />
        <button className="sec" onClick={salir}>
          Cerrar sesión
        </button>
      </header>
      <main>
        <ErrorBoundary key={vista}>{contenido()}</ErrorBoundary>
      </main>
    </>
  );
}
