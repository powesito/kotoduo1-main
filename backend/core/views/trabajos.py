from datetime import timedelta

from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .. import serializers as S
from ..models import (
    AvanceEtapa,
    Estado,
    HistorialEstado,
    Trabajo,
    registrar,
)
from ..roles import PERMISOS, TRAB
from ..serializers import nombre_de
from ..servicios import ajustar_cantidad, sincronizar
from ._base import Pagina, rol_de, solo

DIAS_ALERTA = 1  # "vence pronto" = hoy o dentro de este número de días (1 = hoy y mañana)


ETIQUETAS_TRABAJO = {"cliente": "cliente", "descripcion": "descripción", "tipo_trabajo": "tipo de trabajo",
                     "cantidad_total": "cantidad", "fecha_ingreso": "fecha de ingreso",
                     "fecha_comprometida": "fecha de entrega", "observaciones": "observaciones", "area_actual": "área",
                     "responsable": "responsable"}


def _area_para(responsable, area):
    """Área que debe quedar al asignar a `responsable`: la suya si el trabajo no tenía área;
    error si el trabajo está en otra área distinta."""
    if not responsable or not responsable.area_id:
        return area
    if area is None:
        return responsable.area
    if area.pk != responsable.area_id:
        raise ValidationError({"responsable": f"{nombre_de(responsable)} trabaja en «{responsable.area.nombre_area}»; "
                                              "cambia el área del trabajo o elige a otra persona."})
    return area


class TrabajoViewSet(viewsets.ModelViewSet):
    serializer_class = S.TrabajoSerializer
    pagination_class = Pagina
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        qs = Trabajo.objects.select_related("estado", "area_actual", "responsable").prefetch_related("avance", "etapas")
        if self.action != "list":  # los filtros solo aplican al listado; el detalle encuentra cualquier trabajo
            return qs.order_by("-id")
        p, hoy = self.request.query_params, timezone.localdate()
        ver = p.get("ver", "curso")  # curso | completados | anulados | todos
        if p.get("atrasados") == "1":
            qs = qs.filter(anulado=False, completado=False, fecha_comprometida__lt=hoy)
        elif p.get("vencen") == "1":
            qs = qs.filter(anulado=False, completado=False, fecha_comprometida__gte=hoy,
                           fecha_comprometida__lte=hoy + timedelta(days=DIAS_ALERTA))
        elif ver == "curso":
            qs = qs.filter(anulado=False, completado=False)
        elif ver == "completados":
            qs = qs.filter(anulado=False, completado=True)
        elif ver == "anulados":
            qs = qs.filter(anulado=True)
        if p.get("q"):
            qs = qs.filter(Q(codigo__icontains=p["q"]) | Q(cliente__icontains=p["q"]))
        if p.get("estado", "").isdigit():
            qs = qs.filter(avance__estado_id=p["estado"], avance__cantidad__gt=0).distinct()
        if p.get("area", "").isdigit():
            qs = qs.filter(area_actual_id=p["area"])
        if p.get("responsable") == "none":
            qs = qs.filter(responsable__isnull=True)
        elif p.get("responsable", "").isdigit():
            qs = qs.filter(responsable_id=p["responsable"])
        if p.get("orden") == "entrega":
            return qs.order_by(F("fecha_comprometida").asc(nulls_last=True), "-id")
        return qs.order_by("-id")

    def get_permissions(self):
        if self.action == "create":
            return [solo(*PERMISOS["crear"])()]
        if self.action in ("partial_update", "anular", "restaurar"):
            return [solo(*PERMISOS["editar"])()]
        if self.action in ("seguimiento", "avanzar"):
            return [solo(*PERMISOS["seguimiento"])()]
        return [IsAuthenticated()]

    @staticmethod
    def _verificar_area(u, t):
        if rol_de(u) == TRAB and (not u.area_id or u.area_id != t.area_actual_id):
            raise PermissionDenied("Solo puedes actualizar trabajos que están en tu área.")

    @staticmethod
    def _abierto(t):
        if t.anulado:
            raise ValidationError({"detail": "Este trabajo está anulado."})

    def _devolver(self, t):
        return Response(S.TrabajoSerializer(self.get_queryset().get(pk=t.pk)).data)

    @staticmethod
    def _linea(t, u, tipo, texto):
        HistorialEstado.objects.create(trabajo=t, usuario=u, estado_anterior=t.estado, estado_nuevo=t.estado,
                                       tipo=tipo, observacion=texto[:300])

    @transaction.atomic
    def perform_create(self, serializer):
        etapas = serializer.validated_data.pop("etapas", None) or list(Estado.objects.filter(activo=True))
        etapas = sorted(etapas, key=lambda e: e.orden)
        if len(etapas) < 2:
            raise ValidationError({"etapas": "Elige al menos 2 etapas para el trabajo."})
        estado = etapas[0]
        datos = serializer.validated_data
        if datos.get("responsable"):
            datos["area_actual"] = _area_para(datos["responsable"], datos.get("area_actual"))
        t = serializer.save(estado=estado)
        t.etapas.set(etapas)
        AvanceEtapa.objects.create(trabajo=t, estado=estado, cantidad=t.cantidad_total)
        HistorialEstado.objects.create(trabajo=t, usuario=self.request.user, estado_nuevo=estado,
                                       tipo=HistorialEstado.REGISTRO,
                                       observacion=f"Trabajo registrado ({t.cantidad_total} unidades)")
        if t.responsable:
            self._linea(t, self.request.user, HistorialEstado.SEGUIMIENTO, f"Asignado a {nombre_de(t.responsable)}")
        registrar(self.request.user, "Trabajo", t.pk, "CREAR", f"{t.codigo} · {t.cliente}")

    @transaction.atomic
    def perform_update(self, serializer):
        u = self.request.user
        # Se bloquea la fila: una edición de cantidad no debe cruzarse con un avance de unidades.
        t = Trabajo.objects.select_for_update().get(pk=serializer.instance.pk)
        serializer.instance = t
        self._abierto(t)
        datos = serializer.validated_data
        datos.pop("etapas", None)  # las etapas del trabajo no se cambian después de registrarlo
        if "responsable" in datos or "area_actual" in datos:
            resp = datos["responsable"] if "responsable" in datos else t.responsable
            area = datos["area_actual"] if "area_actual" in datos else t.area_actual
            if "responsable" in datos and resp:
                datos["area_actual"] = _area_para(resp, area)
            elif "responsable" not in datos and resp and resp.area_id and area and area.pk != resp.area_id:
                datos["responsable"] = None  # cambió el área: la persona asignada ya no corresponde
        antes = {k: getattr(t, k) for k in ETIQUETAS_TRABAJO}
        nueva = datos.get("cantidad_total")
        if nueva is not None and nueva != t.cantidad_total:
            ajustar_cantidad(t, nueva)
        t = serializer.save()
        sincronizar(t)
        cambios = [ETIQUETAS_TRABAJO[k] for k in ETIQUETAS_TRABAJO if getattr(t, k) != antes[k]]
        if cambios:
            self._linea(t, u, HistorialEstado.EDICION, "Editado: " + ", ".join(cambios))
            registrar(u, "Trabajo", t.pk, "EDITAR", f"{t.codigo}: " + ", ".join(cambios))

    @action(detail=False, methods=["get"])
    def resumen(self, request):
        """Contadores del tablero; con ?responsable=<id|none> se limitan a esa persona ("Mis trabajos")."""
        hoy = timezone.localdate()
        todos = Trabajo.objects.filter(anulado=False)
        r = request.query_params.get("responsable", "")
        if r.isdigit():
            todos = todos.filter(responsable_id=r)
        elif r == "none":
            todos = todos.filter(responsable__isnull=True)
        base = todos.filter(completado=False)
        return Response({
            "en_curso": base.count(),
            "finalizados": todos.filter(completado=True).count(),
            "atrasados": base.filter(fecha_comprometida__lt=hoy).count(),
            "vencen_pronto": base.filter(fecha_comprometida__gte=hoy,
                                         fecha_comprometida__lte=hoy + timedelta(days=DIAS_ALERTA)).count(),
        })

    @action(detail=False, methods=["get"])
    def opciones(self, request):
        """Lista corta de trabajos en curso (para ligar un movimiento de material a un trabajo)."""
        qs = Trabajo.objects.filter(anulado=False, completado=False).order_by("-id")[:300]
        return Response([{"id": t.pk, "codigo": t.codigo, "cliente": t.cliente} for t in qs])

    @action(detail=True, methods=["post"])
    def seguimiento(self, request, pk=None):
        t, u = self.get_object(), request.user
        self._abierto(t)
        self._verificar_area(u, t)
        s = S.SeguimientoSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        area, antes = (d["area_actual"] if "area_actual" in d else t.area_actual), t.responsable
        if "responsable" in d:
            if rol_de(u) == TRAB and d["responsable"] != antes:
                raise PermissionDenied("Solo Coordinación puede asignar responsables.")
            resp = d["responsable"]
            if resp:
                area = _area_para(resp, area)
        else:
            resp = antes
            if resp and resp.area_id and area and area.pk != resp.area_id:
                resp = None  # cambió el área: la persona asignada ya no corresponde
        nota = ""
        if resp != antes:
            nota = f"Asignado a {nombre_de(resp)}" if resp else "Sin responsable asignado"
        with transaction.atomic():
            t = Trabajo.objects.select_for_update().get(pk=t.pk)
            t.area_actual, t.responsable = area, resp
            t.proxima_actividad = d.get("proxima_actividad", t.proxima_actividad)
            t.save(update_fields=["area_actual", "responsable", "proxima_actividad"])
            texto = " · ".join(x for x in (d["observacion"], nota) if x) or "Seguimiento actualizado"
            self._linea(t, u, HistorialEstado.SEGUIMIENTO, texto)
            detalle = f"{t.codigo}: área / próxima actividad" + (f" · {nota}" if nota else "")
            registrar(u, "Trabajo", t.pk, "SEGUIMIENTO", detalle)
        return self._devolver(t)

    @action(detail=True, methods=["post"])
    def avanzar(self, request, pk=None):
        """Mueve N unidades de una etapa a otra (por defecto, la siguiente)."""
        t, u = self.get_object(), request.user
        self._abierto(t)
        self._verificar_area(u, t)
        s = S.MoverSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        desde, hacia = d["desde"], d.get("hacia")
        if hacia is None:
            hacia = t.etapas.filter(activo=True, orden__gt=desde.orden).order_by("orden").first()
            if not hacia:
                raise ValidationError({"desde": "Esa es la última etapa; no hay a dónde avanzar."})
        if hacia.pk == desde.pk:
            raise ValidationError({"hacia": "Elige una etapa distinta."})
        if t.etapas.filter(pk__in=[desde.pk, hacia.pk]).count() != 2:
            raise ValidationError({"hacia": "Esa etapa no forma parte de este trabajo."})
        with transaction.atomic():
            t = Trabajo.objects.select_for_update().get(pk=t.pk)  # serializa avances y ediciones del mismo trabajo
            origen, _ = AvanceEtapa.objects.select_for_update().get_or_create(trabajo=t, estado=desde)
            if d["cantidad"] > origen.cantidad:
                raise ValidationError({"cantidad": f"Solo hay {origen.cantidad} unidades en {desde}."})
            origen.cantidad -= d["cantidad"]
            origen.save()
            destino, _ = AvanceEtapa.objects.select_for_update().get_or_create(trabajo=t, estado=hacia)
            destino.cantidad += d["cantidad"]
            destino.save()
            sincronizar(t)
            HistorialEstado.objects.create(
                trabajo=t, usuario=u, estado_anterior=desde, estado_nuevo=hacia, tipo=HistorialEstado.AVANCE,
                observacion=f"{d['cantidad']} de {t.cantidad_total} unidades. {d['observacion']}".strip())
            registrar(u, "Trabajo", t.pk, "AVANCE", f"{t.codigo}: {d['cantidad']} u. {desde} → {hacia}")
        return self._devolver(t)

    @action(detail=True, methods=["post"])
    def anular(self, request, pk=None):
        t, u = self.get_object(), request.user
        self._abierto(t)
        s = S.AnularSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        t.anulado, t.motivo_anulacion = True, s.validated_data["motivo"]
        t.save(update_fields=["anulado", "motivo_anulacion"])
        self._linea(t, u, HistorialEstado.ANULACION, f"Anulado: {t.motivo_anulacion}")
        registrar(u, "Trabajo", t.pk, "ANULAR", f"{t.codigo}: {t.motivo_anulacion}")
        return self._devolver(t)

    @action(detail=True, methods=["post"])
    def restaurar(self, request, pk=None):
        t, u = self.get_object(), request.user
        if not t.anulado:
            raise ValidationError({"detail": "Este trabajo no está anulado."})
        t.anulado, t.motivo_anulacion = False, ""
        t.save(update_fields=["anulado", "motivo_anulacion"])
        sincronizar(t)
        self._linea(t, u, HistorialEstado.ANULACION, "Trabajo restaurado")
        registrar(u, "Trabajo", t.pk, "RESTAURAR", t.codigo)
        return self._devolver(t)

    @action(detail=True, methods=["get"])
    def historial(self, request, pk=None):
        h = self.get_object().historial.select_related("usuario", "estado_anterior", "estado_nuevo")
        return Response(S.HistorialEstadoSerializer(h, many=True).data)
