import { plazo } from "../lib/fechas.js";

export default function Plazo({ t }) {
  const p = plazo(t);
  return p ? <span className={"chip plazo " + p.clase}>{p.texto}</span> : null;
}
