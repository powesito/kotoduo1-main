"""Vistas de la API, separadas por tema. `urls.py` las usa como `v.<Vista>`."""
from ._base import Pagina, perfil, rol_de, solo
from .auth import CatalogosView, CsrfView, LoginView, LogoutView, MeView, PasswordView, SaludView
from .etapas import EstadoViewSet
from .historial import HistorialView
from .materiales import MaterialViewSet, MovimientoViewSet
from .trabajos import DIAS_ALERTA, TrabajoViewSet
from .usuarios import UsuarioViewSet

__all__ = [
    "DIAS_ALERTA", "CatalogosView", "CsrfView", "EstadoViewSet", "HistorialView", "LoginView", "LogoutView",
    "MaterialViewSet", "MeView", "MovimientoViewSet", "PasswordView", "Pagina", "SaludView", "TrabajoViewSet",
    "UsuarioViewSet", "perfil", "rol_de", "solo",
]
