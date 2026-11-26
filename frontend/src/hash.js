import { useEffect, useState } from "react";

// Rutas en el hash (#/trabajos/12): se puede recargar o compartir el enlace de un trabajo sin dependencias extra.
const leer = () => location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);

export function useRuta() {
  const [partes, setPartes] = useState(leer);
  useEffect(() => {
    const cambio = () => setPartes(leer());
    window.addEventListener("hashchange", cambio);
    return () => window.removeEventListener("hashchange", cambio);
  }, []);
  const ir = (...p) => {
    location.hash = p.length ? "/" + p.join("/") : "";
  };
  return [partes, ir];
}
