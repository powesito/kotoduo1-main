// El hilo: una costura con una parada por etapa. Cada etapa muestra cuántas unidades hay en ella;
// toda etapa con unidades (incluida "Entregado") se pinta en azul.
export default function Hilo({ estados, avance, etiquetas }) {
  const con = estados.map((e, k) => (avance[e.id] ? k : -1)).filter((k) => k >= 0);
  const min = con.length ? Math.min(...con) : -1;
  const max = con.length ? Math.max(...con) : -1;
  return (
    <ol className={"hilo" + (etiquetas ? " largo" : "")}>
      {estados.map((e, k) => {
        const n = avance[e.id] ?? 0;
        const cls = [n > 0 ? "con" : "", k < min ? "hecho" : "", k <= max ? "tramo" : ""].join(" ");
        return (
          <li key={e.id} className={cls} title={`${e.nombre_estado}: ${n} unidades`}>
            <span className="punto" />
            {etiquetas && <span className="etapa">{e.nombre_estado}</span>}
            <span className="cuenta">{n > 0 ? (etiquetas ? `${n} u.` : n) : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}
