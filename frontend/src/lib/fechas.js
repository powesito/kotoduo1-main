export const fmt = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Acepta: "20" (día de este mes, o del próximo si ya pasó), "20/12", "20/12/2026" o "2026-12-20".
// Devuelve null si está vacío, undefined si no es válida.
export function parseFecha(texto, hoy = new Date()) {
  const s = texto.trim();
  if (!s) return null;
  let d,
    mes = hoy.getMonth(),
    anio = hoy.getFullYear(),
    m;
  if (/^\d{1,2}$/.test(s)) {
    d = +s;
    if (d < hoy.getDate()) mes += 1;
  } else if ((m = s.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2}|\d{4}))?$/))) {
    d = +m[1];
    mes = +m[2] - 1;
    if (m[3]) anio = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  } else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
    anio = +m[1];
    mes = +m[2] - 1;
    d = +m[3];
  } else return undefined;
  const f = new Date(anio, mes, d);
  return f.getDate() === d ? iso(f) : undefined;
}

// Estado del plazo de un trabajo, para mostrarlo como etiqueta.
export function plazo(t) {
  if (t.anulado) return { texto: "Anulado", clase: "alerta" };
  if (t.completado) return { texto: "Finalizado", clase: "bien" };
  const d = t.dias_para_entrega;
  if (d == null) return null;
  if (d < 0) return { texto: `Atrasado ${-d} ${d === -1 ? "día" : "días"}`, clase: "alerta" };
  if (d === 0) return { texto: "Vence hoy", clase: "aviso" };
  if (d === 1) return { texto: "Vence mañana", clase: "aviso" };
  return { texto: `Entrega ${fmt(t.fecha_comprometida)}`, clase: "" };
}
