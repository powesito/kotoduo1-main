import logoClaro from "../assets/logo.png";
import logoOscuro from "../assets/logo-oscuro.png";

// Dos versiones del logo: la del tema oscuro tiene el azul marino pasado a blanco para que se lea.
// El CSS muestra solo la que corresponde al tema activo.
export default function Logo({ className = "" }) {
  const alt = "Kotoduo · Producción en Movimiento";
  return (
    <>
      <img className={"logo logo-claro " + className} src={logoClaro} alt={alt} />
      <img className={"logo logo-oscuro " + className} src={logoOscuro} alt={alt} />
    </>
  );
}
