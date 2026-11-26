"""Reglas de negocio de los trabajos, separadas de las vistas para poder probarlas."""
from django.db.models import Prefetch, Sum
from rest_framework.exceptions import ValidationError

from .models import AvanceEtapa, Estado


def etapas_de(t):
    """Etapas del trabajo en orden. Se usan solo las activas (si no queda ninguna, todas)."""
    todas = list(Estado.objects.filter(trabajos=t).order_by("orden"))
    return [e for e in todas if e.activo] or todas


def _aplicar(t, avance, etapas):
    """Recalcula `estado` (etapa más atrasada que aún tiene unidades) y `completado` (todas las unidades
    están en la última etapa) a partir de datos ya cargados, y guarda solo si algo cambió.
    `avance`: filas AvanceEtapa del trabajo (con su estado cargado). `etapas`: etapas del trabajo."""
    filas = sorted((a for a in avance if a.cantidad > 0), key=lambda a: a.estado.orden)
    etapas = sorted(etapas, key=lambda e: e.orden)
    etapas = [e for e in etapas if e.activo] or etapas
    campos = []
    if filas and filas[0].estado_id != t.estado_id:
        t.estado = filas[0].estado
        campos.append("estado")
    en_ultima = sum(f.cantidad for f in filas if etapas and f.estado_id == etapas[-1].pk)
    completado = bool(etapas) and t.cantidad_total > 0 and en_ultima == t.cantidad_total
    if completado != t.completado:
        t.completado = completado
        campos.append("completado")
    if campos:
        t.save(update_fields=campos)


def sincronizar(t):
    """Sincroniza un trabajo con sus unidades por etapa (consulta datos frescos)."""
    avance = AvanceEtapa.objects.filter(trabajo=t).select_related("estado")
    _aplicar(t, avance, Estado.objects.filter(trabajos=t))


def recalcular_todos():
    """Igual que `sincronizar`, para todos los trabajos no anulados, con una cantidad fija de consultas
    (no una por trabajo): se usa al reordenar o desactivar etapas."""
    from .models import Trabajo
    trabajos = Trabajo.objects.filter(anulado=False).select_related("estado").prefetch_related(
        Prefetch("avance", queryset=AvanceEtapa.objects.select_related("estado")), "etapas")
    for t in trabajos:
        _aplicar(t, t.avance.all(), t.etapas.all())


def ajustar_cantidad(t, nueva):
    """Cambia la cantidad total: las unidades nuevas entran a la primera etapa; solo se pueden
    quitar unidades que todavía están en la primera etapa."""
    primera = etapas_de(t)[0]
    fila, _ = AvanceEtapa.objects.select_for_update().get_or_create(trabajo=t, estado=primera)
    delta = nueva - t.cantidad_total
    if fila.cantidad + delta < 0:
        raise ValidationError({"cantidad_total": f"Solo se pueden quitar unidades que siguen en "
                                                 f"«{primera}» ({fila.cantidad} disponibles)."})
    fila.cantidad += delta
    fila.save()


def mapa_en_uso():
    return {r["estado"]: r["n"] for r in AvanceEtapa.objects.values("estado").annotate(n=Sum("cantidad"))}
