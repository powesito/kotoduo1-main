
from django.db.models import Q
from rest_framework import viewsets
from rest_framework.exceptions import ValidationError

from .. import serializers as S
from ..models import (
    Usuario,
    registrar,
)
from ..roles import ADMIN, PERMISOS
from ._base import rol_de, solo


class UsuarioViewSet(viewsets.ModelViewSet):
    queryset = Usuario.objects.select_related("rol", "area").order_by("username")
    serializer_class = S.UsuarioSerializer
    permission_classes = [solo(*PERMISOS["admin"])]
    http_method_names = ["get", "post", "patch", "head", "options"]

    @staticmethod
    def _otros_admins(u):
        return (Usuario.objects.filter(is_active=True).exclude(pk=u.pk)
                .filter(Q(is_superuser=True) | Q(rol__nombre_rol=ADMIN)).exists())

    def perform_update(self, serializer):
        u, d = serializer.instance, serializer.validated_data
        if u == self.request.user and d.get("is_active") is False:
            raise ValidationError({"detail": "No puedes deshabilitar tu propia cuenta."})
        # Siempre debe quedar al menos un administrador activo.
        rol = d["rol"] if "rol" in d else u.rol
        seguira_admin = d.get("is_active", u.is_active) and (u.is_superuser or (rol and rol.nombre_rol == ADMIN))
        if u.is_active and rol_de(u) == ADMIN and not seguira_admin and not self._otros_admins(u):
            raise ValidationError({"detail": "Debe quedar al menos un administrador activo."})
        cambios = [k for k in ("rol", "area", "is_active", "password") if k in d]
        u = serializer.save()
        registrar(self.request.user, "Usuario", u.pk, "ACTUALIZAR", f"{u.username}: " + ", ".join(cambios))

    def perform_create(self, serializer):
        u = serializer.save()
        registrar(self.request.user, "Usuario", u.pk, "CREAR", u.username)
