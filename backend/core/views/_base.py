import logging

from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import BasePermission

from ..roles import ADMIN, permisos_de

log = logging.getLogger("core")


class Pagina(PageNumberPagination):
    page_size = 25
    page_size_query_param = "tam"
    max_page_size = 100


def rol_de(u):
    return ADMIN if u.is_superuser else (u.rol.nombre_rol if u.rol_id else None)


def solo(*roles):
    """Permiso por rol; se verifica siempre en el servidor (SEG-01)."""
    class _Permiso(BasePermission):
        def has_permission(self, request, view):
            return request.user.is_authenticated and rol_de(request.user) in roles
    return _Permiso


def perfil(u):
    return {"id": u.id, "username": u.username, "nombre": u.get_full_name() or u.username,
            "rol": rol_de(u), "area": u.area_id, "permisos": permisos_de(rol_de(u))}
