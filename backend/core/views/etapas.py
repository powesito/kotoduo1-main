
from django.db import transaction
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .. import serializers as S
from ..models import (
    AvanceEtapa,
    Estado,
    Trabajo,
    registrar,
)
from ..roles import PERMISOS
from ..servicios import recalcular_todos
from ._base import solo


class EstadoViewSet(viewsets.ModelViewSet):
    """Etapas de producción: renombrar, agregar, ordenar y desactivar (no se borran: el historial las usa)."""
    queryset = Estado.objects.all()
    serializer_class = S.EstadoAdminSerializer
    permission_classes = [solo(*PERMISOS["etapas"])]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def perform_create(self, serializer):
        ultimo = Estado.objects.order_by("-orden").first()
        e = serializer.save(orden=ultimo.orden + 1 if ultimo else 0)
        registrar(self.request.user, "Etapa", e.pk, "CREAR", e.nombre_estado)

    def perform_update(self, serializer):
        e = serializer.instance
        cambia_activo = "activo" in serializer.validated_data and serializer.validated_data["activo"] != e.activo
        if serializer.validated_data.get("activo") is False and e.activo:
            if AvanceEtapa.objects.filter(estado=e, cantidad__gt=0).exists():
                raise ValidationError({"detail": "Hay trabajos con unidades en esta etapa. Muévelas antes de desactivarla."})
            if Estado.objects.filter(activo=True).count() <= 2:
                raise ValidationError({"detail": "Debe quedar al menos 2 etapas activas."})
            for t in Trabajo.objects.filter(anulado=False, completado=False, etapas=e):
                if t.etapas.filter(activo=True).exclude(pk=e.pk).count() < 2:
                    raise ValidationError({"detail": f"El trabajo {t.codigo} quedaría con menos de 2 etapas activas."})
        anterior = e.nombre_estado
        e = serializer.save()
        if cambia_activo:
            recalcular_todos()  # puede cambiar cuál es la "última etapa" de algunos trabajos
        registrar(self.request.user, "Etapa", e.pk, "ACTUALIZAR",
                  f"{anterior} → {e.nombre_estado}" + ("" if e.activo else " (desactivada)"))

    @action(detail=False, methods=["post"])
    def ordenar(self, request):
        ids = request.data.get("ids")
        if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids) \
                or sorted(ids) != sorted(Estado.objects.values_list("id", flat=True)):
            raise ValidationError({"detail": "Lista de etapas no válida."})
        with transaction.atomic():
            for orden, pk in enumerate(ids):
                Estado.objects.filter(pk=pk).update(orden=orden)
            recalcular_todos()
            registrar(request.user, "Etapa", 0, "ORDENAR", "Orden de etapas actualizado")
        return Response(S.EstadoAdminSerializer(Estado.objects.all(), many=True).data)
