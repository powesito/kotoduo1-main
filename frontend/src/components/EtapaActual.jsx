import Hilo from "./Hilo.jsx";

// Lo más importante de un trabajo, en grande: en qué etapa está y cuántas unidades hay en ella.
export default function EtapaActual({ t, est }) {
  if (t.anulado) return null;
  if (!est.length) return <p className="msg error">Este trabajo no tiene etapas activas. Pide a un administrador que revise las etapas.</p>;
  const enEtapa = t.avance[t.estado] ?? 0;
  const otras = est.filter((e) => e.id !== t.estado && (t.avance[e.id] ?? 0) > 0);
  return (
    <section className={"etapa-actual" + (t.completado ? " final" : "")} aria-label="Etapa actual">
      <small>Etapa actual</small>
      <span className="etapa-nombre">{t.completado ? "✔ Finalizado" : t.estado_nombre}</span>
      <span className="unidades">
        {t.completado ? t.cantidad_total : enEtapa} de {t.cantidad_total} unidades
      </span>
      {!t.completado && otras.length > 0 && (
        <span className="otras">También hay: {otras.map((e) => `${t.avance[e.id]} u. en ${e.nombre_estado}`).join(" · ")}</span>
      )}
      <Hilo estados={est} avance={t.avance} etiquetas />
      <progress value={t.entregadas} max={t.cantidad_total} aria-label="Unidades finalizadas" />
      <small>
        {t.entregadas} de {t.cantidad_total} unidades finalizadas
      </small>
    </section>
  );
}
