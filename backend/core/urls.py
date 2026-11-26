from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views as v

router = DefaultRouter()
router.register("trabajos", v.TrabajoViewSet, basename="trabajo")
router.register("etapas", v.EstadoViewSet, basename="etapa")
router.register("materiales", v.MaterialViewSet, basename="material")
router.register("movimientos", v.MovimientoViewSet, basename="movimiento")
router.register("usuarios", v.UsuarioViewSet, basename="usuario")

urlpatterns = [
    path("salud/", v.SaludView.as_view()),
    path("auth/csrf/", v.CsrfView.as_view()),
    path("auth/login/", v.LoginView.as_view()),
    path("auth/logout/", v.LogoutView.as_view()),
    path("auth/me/", v.MeView.as_view()),
    path("auth/password/", v.PasswordView.as_view()),
    path("catalogos/", v.CatalogosView.as_view()),
    path("historial/", v.HistorialView.as_view()),
    path("", include(router.urls)),
]
