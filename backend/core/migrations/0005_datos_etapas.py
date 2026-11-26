from django.db import migrations


def asignar_etapas(apps, schema_editor):
    Trabajo, Estado = apps.get_model("core", "Trabajo"), apps.get_model("core", "Estado")
    todas = list(Estado.objects.all())
    for t in Trabajo.objects.all():
        t.etapas.set(todas)


class Migration(migrations.Migration):
    dependencies = [("core", "0004_etapas_por_trabajo")]
    operations = [migrations.RunPython(asignar_etapas, migrations.RunPython.noop)]
