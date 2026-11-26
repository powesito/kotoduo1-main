const csrf = () =>
  decodeURIComponent(
    document.cookie
      .split("; ")
      .find((c) => c.startsWith("csrftoken="))
      ?.split("=")[1] ?? "",
  );

const CAMPOS = {
  cliente: "Cliente",
  descripcion: "Descripción",
  tipo_trabajo: "Tipo de trabajo",
  cantidad_total: "Cantidad",
  fecha_comprometida: "Fecha de entrega",
  fecha_ingreso: "Fecha de ingreso",
  nombre: "Nombre",
  nombre_estado: "Etapa",
  unidad_medida: "Unidad",
  stock_minimo: "Mínimo",
  cantidad: "Cantidad",
  username: "Usuario",
  password: "Contraseña",
  actual: "Contraseña actual",
  nueva: "Contraseña nueva",
  motivo: "Motivo",
  etapas: "Etapas",
};

function mensaje(d, status) {
  if (status >= 500) return "Error del servidor. Intenta de nuevo en un momento.";
  if (!d) return "No se pudo conectar con el servidor.";
  if (d.detail) return [].concat(d.detail).join(" ");
  return Object.entries(d)
    .map(([k, v]) => `${CAMPOS[k] ?? k}: ${[].concat(v).join(" ")}`)
    .join("; ");
}

// Se avisa a la app cuando la sesión caduca (401) para volver al login en vez de mostrar errores sueltos.
let alExpirar = () => {};
export const alSesionExpirada = (fn) => {
  alExpirar = fn;
};
const SIN_AVISO = ["/auth/me/", "/auth/login/", "/auth/csrf/"];

export async function api(ruta, { method = "GET", body, signal } = {}, reintento = true) {
  let res;
  try {
    res = await fetch("/api" + ruta, {
      method,
      signal,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf() },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw Object.assign(new Error("No se pudo conectar con el servidor."), { status: 0 });
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.status === 403 && reintento && /CSRF/i.test(data?.detail ?? "")) {
    await fetch("/api/auth/csrf/", { credentials: "same-origin" }); // renueva la cookie y reintenta una vez
    return api(ruta, { method, body, signal }, false);
  }
  if (res.status === 401 && !SIN_AVISO.includes(ruta)) alExpirar();
  if (!res.ok) throw Object.assign(new Error(mensaje(data, res.status)), { status: res.status });
  return data;
}
