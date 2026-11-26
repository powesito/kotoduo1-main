from django.db import migrations
from django.db.models import F


def calcular(apps, schema_editor):
    Trabajo, Historial = apps.get_model("core", "Trabajo"), apps.get_model("core", "HistorialEstado")
    Historial.objects.filter(estado_anterior__isnull=True).update(tipo="REGISTRO")
    Historial.objects.filter(estado_anterior_id=F("estado_nuevo_id")).update(tipo="SEGUIMIENTO")
    for t in Trabajo.objects.all():
        etapas = sorted(t.etapas.all(), key=lambda e: e.orden)
        etapas = [e for e in etapas if e.activo] or etapas
        if not etapas:
            continue
        en_ultima = sum(a.cantidad for a in t.avance.all() if a.estado_id == etapas[-1].pk)
        if t.cantidad_total > 0 and en_ultima == t.cantidad_total:
            t.completado = True
            t.save(update_fields=["completado"])


class Migration(migrations.Migration):
    dependencies = [("core", "0006_estado_trabajo_y_tipo_historial")]
    operations = [migrations.RunPython(calcular, migrations.RunPython.noop)]
