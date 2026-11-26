
from django.db.models import Q
from rest_framework import generics

from .. import serializers as S
from ..models import (
    HistorialCambio,
)
from ..roles import PERMISOS
from ._base import Pagina, solo


class HistorialView(generics.ListAPIView):
    serializer_class = S.HistorialCambioSerializer
    permission_classes = [solo(*PERMISOS["historial"])]
    pagination_class = Pagina

    def get_queryset(self):
        qs, p = HistorialCambio.objects.select_related("usuario"), self.request.query_params
        if p.get("entidad"):
            qs = qs.filter(entidad=p["entidad"])
        if p.get("q"):
            qs = qs.filter(Q(detalle_resumido__icontains=p["q"]) | Q(usuario__username__icontains=p["q"]))
        return qs
