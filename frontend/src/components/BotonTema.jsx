import { useState } from "react";

const actual = () => (document.documentElement.dataset.tema === "oscuro" ? "oscuro" : "claro");

// Alterna entre tema claro y oscuro y recuerda la elección en este navegador.
export default function BotonTema() {
  const [tema, setTema] = useState(actual);
  const cambiar = () => {
    const nuevo = tema === "oscuro" ? "claro" : "oscuro";
    document.documentElement.dataset.tema = nuevo;
    try {
      localStorage.setItem("kotoduo-tema", nuevo);
    } catch {
      /* sin almacenamiento: el cambio vale solo para esta sesión */
    }
    setTema(nuevo);
  };
  const aOscuro = tema === "claro";
  return (
    <button className="sec tema" onClick={cambiar} title={aOscuro ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}>
      <span aria-hidden="true">{aOscuro ? "☾" : "☀"}</span> <span className="tema-txt">{aOscuro ? "Tema oscuro" : "Tema claro"}</span>
    </button>
  );
}
