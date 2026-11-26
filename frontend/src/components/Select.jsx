// opciones: [{ id, nombre }] (también acepta nombre_estado / nombre_area de los catálogos).
export default function Select({ valor, onChange, opciones, vacio, ...resto }) {
  return (
    <select value={valor} onChange={(e) => onChange(e.target.value)} {...resto}>
      {vacio !== undefined && <option value="">{vacio}</option>}
      {opciones.map((o) => (
        <option key={o.id} value={o.id}>
          {o.nombre ?? o.nombre_estado ?? o.nombre_area}
        </option>
      ))}
    </select>
  );
}
