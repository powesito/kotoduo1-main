// Etapas activas que usa un trabajo, en orden.
export const etapasDe = (t, cat) => cat.estados.filter((e) => t.etapas.includes(e.id));
