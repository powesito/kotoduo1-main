// Se ejecuta antes de dibujar la página para que no parpadee el tema equivocado.
// Usa la elección guardada; si no hay, la preferencia del sistema operativo.
(function () {
  var tema = "claro";
  try {
    tema = localStorage.getItem("kotoduo-tema") || (matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro");
  } catch (e) {}
  document.documentElement.dataset.tema = tema;
})();
