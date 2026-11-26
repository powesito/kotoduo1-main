from django.db import migrations


def crear_avance(apps, schema_editor):
    Trabajo, Avance = apps.get_model("core", "Trabajo"), apps.get_model("core", "AvanceEtapa")
    for t in Trabajo.objects.all():
        Avance.objects.get_or_create(trabajo=t, estado=t.estado, defaults={"cantidad": t.cantidad_total})


class Migration(migrations.Migration):
    dependencies = [("core", "0002_unidades_por_etapa")]
    operations = [migrations.RunPython(crear_avance, migrations.RunPython.noop)]
