
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .. import serializers as S
from ..models import (
    Material,
    MovimientoMaterial,
    registrar,
)
from ..roles import PERMISOS
from ._base import Pagina, rol_de, solo


class MaterialViewSet(viewsets.ModelViewSet):
    serializer_class = S.MaterialSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = Material.objects.all()
        quiere_todos = self.request.query_params.get("todos") == "1" and rol_de(self.request.user) in PERMISOS["material"]
        return qs if self.action != "list" or quiere_todos else qs.filter(activo=True)

    def get_permissions(self):
        if self.action in ("create", "partial_update", "destroy"):
            return [solo(*PERMISOS["material"])()]
        if self.action == "movimiento":
            return [solo(*PERMISOS["movimientos"])()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        m = serializer.save()
        registrar(self.request.user, "Material", m.pk, "CREAR", m.nombre)

    def perform_update(self, serializer):
        m = serializer.save()
        registrar(self.request.user, "Material", m.pk, "ACTUALIZAR",
                  f"{m.nombre} (mínimo {m.stock_minimo}, {'activo' if m.activo else 'desactivado'})")

    def perform_destroy(self, m):
        # Con movimientos registrados no se elimina (se perdería el historial de existencias): se desactiva.
        if m.movimientos.exists():
            raise ValidationError({"detail": "Este material tiene movimientos registrados y no se puede eliminar. "
                                             "Puedes desactivarlo para que deje de aparecer."})
        nombre, pk = m.nombre, m.pk
        m.delete()
        registrar(self.request.user, "Material", pk, "ELIMINAR", nombre)

    @action(detail=True, methods=["post"])
    def movimiento(self, request, pk=None):
        s = S.MovimientoSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        with transaction.atomic():
            m = get_object_or_404(Material.objects.select_for_update(), pk=pk)
            if not m.activo:
                raise ValidationError({"detail": "Este material está desactivado."})
            delta = d["cantidad"] if d["tipo_movimiento"] == "ENTRADA" else -d["cantidad"]
            if m.existencia_actual + delta < 0:
                raise ValidationError({"cantidad": "La salida supera la existencia disponible."})
            m.existencia_actual += delta
            m.save(update_fields=["existencia_actual"])
            MovimientoMaterial.objects.create(material=m, usuario=request.user, **d)
            registrar(request.user, "Material", m.pk, d["tipo_movimiento"], f"{m.nombre}: {d['cantidad']}")
        return Response(S.MaterialSerializer(m).data)

    @action(detail=True, methods=["get"])
    def movimientos(self, request, pk=None):
        qs = self.get_object().movimientos.select_related("usuario", "trabajo").order_by("-fecha_hora", "-id")
        pag = Pagina()
        pagina = pag.paginate_queryset(qs, request, view=self)
        return pag.get_paginated_response(S.MovimientoListaSerializer(pagina, many=True).data)


class MovimientoViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Movimientos de material: listar (por trabajo o material), corregir y eliminar.
    Corregir o eliminar ajusta la existencia del material; nunca puede quedar negativa."""
    serializer_class = S.MovimientoListaSerializer
    pagination_class = Pagina
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_permissions(self):
        return [IsAuthenticated()] if self.action == "list" else [solo(*PERMISOS["material"])()]

    def get_queryset(self):
        qs = MovimientoMaterial.objects.select_related("material", "usuario", "trabajo").order_by("-fecha_hora", "-id")
        p = self.request.query_params
        if p.get("trabajo", "").isdigit():
            qs = qs.filter(trabajo_id=p["trabajo"])
        if p.get("material", "").isdigit():
            qs = qs.filter(material_id=p["material"])
        return qs

    @staticmethod
    def _efecto(mov, cantidad):
        return cantidad if mov.tipo_movimiento == MovimientoMaterial.ENTRADA else -cantidad

    def partial_update(self, request, pk=None):
        mov = get_object_or_404(MovimientoMaterial, pk=pk)
        s = S.MovimientoEditarSerializer(mov, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            m = Material.objects.select_for_update().get(pk=mov.material_id)
            nueva = s.validated_data.get("cantidad", mov.cantidad)
            delta = self._efecto(mov, nueva) - self._efecto(mov, mov.cantidad)
            if m.existencia_actual + delta < 0:
                raise ValidationError({"cantidad": "Con ese cambio la existencia quedaría negativa."})
            m.existencia_actual += delta
            m.save(update_fields=["existencia_actual"])
            s.save()
            registrar(request.user, "Material", m.pk, "EDITAR_MOV", f"{m.nombre}: movimiento #{mov.pk} → {nueva}")
        return Response(S.MovimientoListaSerializer(self.get_queryset().get(pk=mov.pk)).data)

    def destroy(self, request, pk=None):
        mov = get_object_or_404(MovimientoMaterial, pk=pk)
        with transaction.atomic():
            m = Material.objects.select_for_update().get(pk=mov.material_id)
            if m.existencia_actual - self._efecto(mov, mov.cantidad) < 0:
                raise ValidationError({"detail": "No se puede eliminar: la existencia quedaría negativa."})
            m.existencia_actual -= self._efecto(mov, mov.cantidad)
            m.save(update_fields=["existencia_actual"])
            detalle = f"{m.nombre}: {mov.get_tipo_movimiento_display().lower()} de {mov.cantidad}"
            mov.delete()
            registrar(request.user, "Material", m.pk, "ELIMINAR_MOV", detalle)
        return Response(status=204)
