from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import Area, AvanceEtapa, Estado, Material, Rol, Trabajo, Usuario
from core.roles import ADMIN, COORD, MAT, ROLES, TRAB
from core.servicios import sincronizar

ETAPAS = ["Recibido", "Diseño", "Producción", "Control de calidad", "Listo para entrega", "Entregado"]
AREAS = ["Diseño", "Bordado", "Sublimación", "Grabado", "Letreros", "Impresión gran formato"]
CLAVE_DEMO = "kotoduo123"


class Command(BaseCommand):
    help = ("Carga roles, etapas y áreas (seguro en producción: no toca usuarios ni contraseñas). "
            "Con DEBUG=1 agrega además usuarios y trabajos de ejemplo.")

    def handle(self, *args, **opts):
        roles = {n: Rol.objects.get_or_create(nombre_rol=n)[0] for n in ROLES}
        estados = [Estado.objects.get_or_create(nombre_estado=n, defaults={"orden": i})[0] for i, n in enumerate(ETAPAS)]
        areas = {n: Area.objects.get_or_create(nombre_area=n)[0] for n in AREAS}
        self.stdout.write("Roles, etapas y áreas listos.")
        if not settings.DEBUG:
            self.stdout.write("DEBUG=0: no se crean datos de ejemplo. Crea el administrador con "
                              "`python manage.py createsuperuser`.")
            return

        demo = [("admin", ADMIN, None), ("coordinacion", COORD, None),
                ("materiales", MAT, None), ("trabajador", TRAB, "Bordado")]
        for username, rol, area in demo:
            u, creado = Usuario.objects.get_or_create(username=username, defaults={
                "rol": roles[rol], "area": areas.get(area), "first_name": username.capitalize()})
            if creado:  # la contraseña demo solo se fija al crear; nunca se sobrescribe la de una cuenta existente
                u.set_password(CLAVE_DEMO)
                u.save()
        for nombre, unidad, existencia, minimo in [("Hilo de bordado negro", "conos", 12, 5),
                                                    ("Papel de sublimación", "rollos", 4, 6),
                                                    ("Tela poliéster blanca", "metros", 80, 30)]:
            Material.objects.get_or_create(nombre=nombre, defaults={
                "unidad_medida": unidad, "existencia_actual": existencia, "stock_minimo": minimo})
        if not Trabajo.objects.exists():
            hoy = timezone.localdate()
            for cliente, desc, tipo, total, reparto, a, prox, ingreso, entrega in [
                ("Colegio San Martín", "60 buzos con escudo bordado", "Bordado", 60, {2: 40, 3: 20}, "Bordado",
                 "Bordar escudo en pecho", -20, -3),
                ("Club Deportivo Ñuble", "30 camisetas sublimadas", "Sublimación", 30, {1: 30}, "Diseño",
                 "Aprobar diseño con el club", -5, 2),
                ("Municipalidad", "Letrero de entrada, 2 m", "Letreros", 1, {0: 1}, "Letreros",
                 "Medir e instalar", 0, 15)]:
                t = Trabajo.objects.create(
                    cliente=cliente, descripcion=desc, tipo_trabajo=tipo, cantidad_total=total,
                    estado=estados[min(reparto)], area_actual=areas[a], proxima_actividad=prox,
                    fecha_ingreso=hoy + timedelta(days=ingreso), fecha_comprometida=hoy + timedelta(days=entrega))
                t.etapas.set(estados)
                for e, n in reparto.items():
                    AvanceEtapa.objects.create(trabajo=t, estado=estados[e], cantidad=n)
                if a == "Bordado":
                    t.responsable = Usuario.objects.filter(username="trabajador").first()
                    t.save(update_fields=["responsable"])
                sincronizar(t)
        self.stdout.write(f"Datos de ejemplo listos. Usuarios: admin, coordinacion, materiales, trabajador / {CLAVE_DEMO}")
