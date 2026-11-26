import { useEffect, useRef, useState } from "react";

export function useDebounce(valor, ms = 300) {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

// Ejecuta `fn` cada `ms` milisegundos mientras la pestaña está visible, y al volver a ella.
// (No consulta al servidor con la pantalla en segundo plano.)
export function useAutoRefresco(fn, ms = 45000) {
  const ultima = useRef(fn);
  ultima.current = fn; // siempre la versión más reciente, sin reiniciar el temporizador
  useEffect(() => {
    const ejecutar = () => {
      if (!document.hidden) ultima.current();
    };
    const id = setInterval(ejecutar, ms);
    document.addEventListener("visibilitychange", ejecutar);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", ejecutar);
    };
  }, [ms]);
}
