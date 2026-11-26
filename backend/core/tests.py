import os
import subprocess
import sys
from datetime import timedelta
from decimal import Decimal

from django.core.cache import cache
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Area, AvanceEtapa, Estado, Material, Rol, Trabajo, Usuario
from .roles import PERMISOS, ROLES
from .servicios import recalcular_todos

ETAPAS = ["Recibido", "Diseño", "Producción", "Entregado"]


class Base(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.roles = {n: Rol.objects.create(nombre_rol=n) for n in ("ADMIN", "COORDINACION", "MATERIALES", "TRABAJADOR")}
        cls.estados = [Estado.objects.create(nombre_estado=n, orden=i) for i, n in enumerate(ETAPAS)]
        cls.bordado = Area.objects.create(nombre_area="Bordado")
        cls.grabado = Area.objects.create(nombre_area="Grabado")
        mk = lambda n, r, a=None: Usuario.objects.create_user(n, password="Clave-Segura-77", rol=cls.roles[r], area=a)
        cls.admin, cls.coord = mk("admin", "ADMIN"), mk("coord", "COORDINACION")
        cls.mat, cls.trab = mk("mat", "MATERIALES"), mk("trab", "TRABAJADOR", cls.bordado)

    def setUp(self):
        cache.clear()

    def como(self, usuario=None):
        c = APIClient()
        if usuario:
            c.force_login(usuario)
        return c

    def crear_trabajo(self, usuario=None, **extra):
        datos = {"cliente": "Cliente", "descripcion": "Algo", "tipo_trabajo": "Bordado", "cantidad_total": 10,
                 "area_actual": self.bordado.pk, **extra}
        r = self.como(usuario or self.coord).post("/api/trabajos/", datos, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return Trabajo.objects.get(pk=r.data["id"])


class SesionYSeguridad(Base):
    def test_sin_sesion_responde_401(self):
        self.assertEqual(self.como().get("/api/auth/me/").status_code, 401)

    def test_login_ok_y_error(self):
        c = self.como()
        self.assertEqual(c.post("/api/auth/login/", {"username": "admin", "password": "mala"}, format="json").status_code, 400)
        self.assertEqual(c.post("/api/auth/login/", {"username": "admin", "password": "Clave-Segura-77"}, format="json").status_code, 200)

    def test_produccion_exige_secret_key(self):
        env = {k: v for k, v in os.environ.items() if k != "SECRET_KEY"}
        env["DEBUG"] = "0"
        r = subprocess.run([sys.executable, "-c", "import config.settings"], env=env, capture_output=True,
                           cwd=os.path.dirname(os.path.dirname(__file__)))
        self.assertNotEqual(r.returncode, 0)
        self.assertIn(b"SECRET_KEY", r.stderr)

    def test_sin_variable_debug_corre_como_produccion(self):
        env = {k: v for k, v in os.environ.items() if k not in ("SECRET_KEY", "DEBUG")}
        r = subprocess.run([sys.executable, "-c", "import config.settings"], env=env, capture_output=True,
                           cwd=os.path.dirname(os.path.dirname(__file__)))
        self.assertNotEqual(r.returncode, 0)  # exige SECRET_KEY: no arranca en modo debug por olvido

    def test_cambiar_password_propia(self):
        c = self.como(self.trab)
        malo = c.post("/api/auth/password/", {"actual": "x", "nueva": "Otra-Clave-9981"}, format="json")
        self.assertEqual(malo.status_code, 400)
        debil = c.post("/api/auth/password/", {"actual": "Clave-Segura-77", "nueva": "123"}, format="json")
        self.assertEqual(debil.status_code, 400)
        ok = c.post("/api/auth/password/", {"actual": "Clave-Segura-77", "nueva": "Otra-Clave-9981"}, format="json")
        self.assertEqual(ok.status_code, 204)
        self.assertEqual(c.get("/api/auth/me/").status_code, 200)  # la sesión sigue activa
        self.trab.refresh_from_db()
        self.assertTrue(self.trab.check_password("Otra-Clave-9981"))


class SeedTests(TestCase):
    @override_settings(DEBUG=True)
    def test_seed_no_pisa_contrasenas(self):
        call_command("seed", verbosity=0)
        u = Usuario.objects.get(username="admin")
        u.set_password("Mi-Clave-Propia-55")
        u.save()
        call_command("seed", verbosity=0)
        self.assertTrue(Usuario.objects.get(username="admin").check_password("Mi-Clave-Propia-55"))

    @override_settings(DEBUG=False)
    def test_seed_en_produccion_no_crea_usuarios(self):
        call_command("seed", verbosity=0)
        self.assertEqual(Usuario.objects.count(), 0)
        self.assertEqual(Estado.objects.count(), 6)


class Trabajos(Base):
    def test_permisos_de_creacion(self):
        datos = {"cliente": "X", "descripcion": "d", "tipo_trabajo": "t", "cantidad_total": 1}
        self.assertEqual(self.como(self.trab).post("/api/trabajos/", datos, format="json").status_code, 403)
        self.assertEqual(self.como(self.mat).post("/api/trabajos/", datos, format="json").status_code, 403)

    def test_crear_asigna_codigo_y_unidades(self):
        t = self.crear_trabajo()
        self.assertEqual(t.codigo, f"KT-{t.pk:04d}")
        self.assertEqual(AvanceEtapa.objects.get(trabajo=t).cantidad, 10)
        self.assertEqual(t.estado, self.estados[0])

    def test_minimo_dos_etapas(self):
        r = self.como(self.coord).post("/api/trabajos/", {
            "cliente": "X", "descripcion": "d", "tipo_trabajo": "t", "cantidad_total": 1,
            "etapas": [self.estados[0].pk]}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_fecha_entrega_anterior_al_ingreso(self):
        ayer = (timezone.localdate() - timedelta(days=1)).isoformat()
        r = self.como(self.coord).post("/api/trabajos/", {
            "cliente": "X", "descripcion": "d", "tipo_trabajo": "t", "cantidad_total": 1,
            "fecha_comprometida": ayer}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_avanzar_valida_cantidades_y_completa(self):
        t = self.crear_trabajo()
        c = self.como(self.coord)
        pasar = lambda n, **k: c.post(f"/api/trabajos/{t.pk}/avanzar/", {"desde": self.estados[0].pk, "cantidad": n, **k}, format="json")
        self.assertEqual(pasar(11).status_code, 400)
        self.assertEqual(pasar(4).status_code, 200)
        t.refresh_from_db()
        self.assertFalse(t.completado)
        r = pasar(6, hacia=self.estados[3].pk)  # salta directo a la última etapa
        self.assertEqual(r.status_code, 200)
        # 4 en Diseño, 6 en Entregado: el estado general es la etapa más atrasada
        t.refresh_from_db()
        self.assertEqual(t.estado, self.estados[1])
        self.assertEqual(r.data["entregadas"], 6)
        c.post(f"/api/trabajos/{t.pk}/avanzar/", {"desde": self.estados[1].pk, "cantidad": 4, "hacia": self.estados[3].pk}, format="json")
        t.refresh_from_db()
        self.assertTrue(t.completado)

    def test_trabajador_solo_en_su_area(self):
        t = self.crear_trabajo(area_actual=self.grabado.pk)
        r = self.como(self.trab).post(f"/api/trabajos/{t.pk}/avanzar/", {"desde": self.estados[0].pk, "cantidad": 1}, format="json")
        self.assertEqual(r.status_code, 403)
        propio = self.crear_trabajo()
        r = self.como(self.trab).post(f"/api/trabajos/{propio.pk}/avanzar/", {"desde": self.estados[0].pk, "cantidad": 1}, format="json")
        self.assertEqual(r.status_code, 200)

    def test_editar_trabajo_y_cantidad(self):
        t = self.crear_trabajo()
        c = self.como(self.coord)
        self.assertEqual(self.como(self.trab).patch(f"/api/trabajos/{t.pk}/", {"cliente": "Z"}, format="json").status_code, 403)
        r = c.patch(f"/api/trabajos/{t.pk}/", {"cliente": "Nuevo", "cantidad_total": 15}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["avance"][str(self.estados[0].pk)], 15)
        c.post(f"/api/trabajos/{t.pk}/avanzar/", {"desde": self.estados[0].pk, "cantidad": 12}, format="json")
        r = c.patch(f"/api/trabajos/{t.pk}/", {"cantidad_total": 5}, format="json")  # solo quedan 3 en la primera etapa
        self.assertEqual(r.status_code, 400)
        r = c.patch(f"/api/trabajos/{t.pk}/", {"cantidad_total": 12}, format="json")
        self.assertEqual(r.status_code, 200)
        tipos = list(t.historial.values_list("tipo", flat=True))
        self.assertIn("EDICION", tipos)

    def test_anular_y_restaurar(self):
        t = self.crear_trabajo()
        c = self.como(self.coord)
        self.assertEqual(c.post(f"/api/trabajos/{t.pk}/anular/", {}, format="json").status_code, 400)  # exige motivo
        self.assertEqual(c.post(f"/api/trabajos/{t.pk}/anular/", {"motivo": "Cliente canceló"}, format="json").status_code, 200)
        self.assertEqual(c.get("/api/trabajos/").data["count"], 0)
        self.assertEqual(c.get("/api/trabajos/?ver=anulados").data["count"], 1)
        r = c.post(f"/api/trabajos/{t.pk}/avanzar/", {"desde": self.estados[0].pk, "cantidad": 1}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(c.patch(f"/api/trabajos/{t.pk}/", {"cliente": "x"}, format="json").status_code, 400)
        self.assertEqual(c.post(f"/api/trabajos/{t.pk}/restaurar/", format="json").status_code, 200)
        self.assertEqual(c.get("/api/trabajos/").data["count"], 1)

    def test_filtros_atrasados_orden_y_paginacion(self):
        hoy = timezone.localdate()
        en = lambda d, **k: self.crear_trabajo(fecha_comprometida=(hoy + timedelta(days=d)).isoformat(), **k)
        viejo = en(-2, fecha_ingreso=(hoy - timedelta(days=30)).isoformat())
        manana = en(1)
        dos_dias = en(2)
        lejos = en(30)
        sin = self.crear_trabajo()
        c = self.como(self.coord)
        ids = lambda url: [t["id"] for t in c.get(url).data["results"]]
        self.assertEqual(ids("/api/trabajos/?atrasados=1"), [viejo.pk])
        self.assertEqual(ids("/api/trabajos/?vencen=1"), [manana.pk])  # "vence pronto" = hoy o mañana
        self.assertEqual(ids("/api/trabajos/?orden=entrega"), [viejo.pk, manana.pk, dos_dias.pk, lejos.pk, sin.pk])
        self.assertEqual(len(c.get("/api/trabajos/?tam=2").data["results"]), 2)
        self.assertEqual(c.get("/api/trabajos/resumen/").data, {"en_curso": 5, "finalizados": 0, "atrasados": 1, "vencen_pronto": 1})
        self.assertEqual(c.get(f"/api/trabajos/{viejo.pk}/").data["dias_para_entrega"], -2)

    def test_detalle_encuentra_trabajo_completado(self):
        t = self.crear_trabajo(cantidad_total=1)
        c = self.como(self.coord)
        c.post(f"/api/trabajos/{t.pk}/avanzar/", {"desde": self.estados[0].pk, "cantidad": 1, "hacia": self.estados[3].pk}, format="json")
        self.assertEqual(c.get("/api/trabajos/").data["count"], 0)  # ya no está "en curso"
        self.assertEqual(c.get("/api/trabajos/?ver=completados").data["count"], 1)
        self.assertEqual(c.get("/api/trabajos/resumen/").data["finalizados"], 1)
        self.assertEqual(c.get(f"/api/trabajos/{t.pk}/").status_code, 200)


class Etapas(Base):
    def test_no_desactiva_con_unidades(self):
        self.crear_trabajo()
        r = self.como(self.coord).patch(f"/api/etapas/{self.estados[0].pk}/", {"activo": False}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_no_deja_trabajo_con_menos_de_dos_etapas(self):
        self.crear_trabajo(etapas=[e.pk for e in self.estados[1:]])  # usa Diseño, Producción, Entregado
        self.crear_trabajo(etapas=[self.estados[1].pk, self.estados[2].pk])
        c = self.como(self.coord)
        self.assertEqual(c.patch(f"/api/etapas/{self.estados[3].pk}/", {"activo": False}, format="json").status_code, 200)
        r = c.patch(f"/api/etapas/{self.estados[2].pk}/", {"activo": False}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_reordenar_recalcula_estado(self):
        t = self.crear_trabajo()
        c = self.como(self.coord)
        ids = [e.pk for e in self.estados]
        r = c.post("/api/etapas/ordenar/", {"ids": ids[::-1]}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(c.post("/api/etapas/ordenar/", {"ids": ids[:2]}, format="json").status_code, 400)
        t.refresh_from_db()
        self.assertEqual(t.estado, self.estados[0])  # sigue siendo la única etapa con unidades


class Materiales(Base):
    def setUp(self):
        super().setUp()
        self.m = Material.objects.create(nombre="Hilo", unidad_medida="conos", existencia_actual=5, stock_minimo=2)

    def mover(self, tipo, n, usuario=None, **extra):
        return self.como(usuario or self.mat).post(f"/api/materiales/{self.m.pk}/movimiento/",
                                                   {"tipo_movimiento": tipo, "cantidad": n, **extra}, format="json")

    def test_salida_no_puede_superar_existencia(self):
        self.assertEqual(self.mover("SALIDA", "6").status_code, 400)
        self.assertEqual(self.mover("SALIDA", "5").status_code, 200)
        self.m.refresh_from_db()
        self.assertEqual(self.m.existencia_actual, Decimal("0"))

    def test_trabajador_no_registra_movimientos(self):
        self.assertEqual(self.mover("ENTRADA", "1", self.trab).status_code, 403)

    def test_movimiento_ligado_a_trabajo_y_listado(self):
        t = self.crear_trabajo()
        self.assertEqual(self.mover("SALIDA", "1", trabajo=t.pk).status_code, 200)
        r = self.como(self.mat).get(f"/api/materiales/{self.m.pk}/movimientos/")
        self.assertEqual(r.data["results"][0]["trabajo"], t.codigo)

    def test_material_desactivado(self):
        c = self.como(self.mat)
        self.assertEqual(c.patch(f"/api/materiales/{self.m.pk}/", {"activo": False, "stock_minimo": "3"}, format="json").status_code, 200)
        self.assertEqual(len(c.get("/api/materiales/").data), 0)
        self.assertEqual(len(c.get("/api/materiales/?todos=1").data), 1)
        self.assertEqual(self.mover("ENTRADA", "1").status_code, 400)
        self.assertEqual(self.como(self.trab).patch(f"/api/materiales/{self.m.pk}/", {"activo": True}, format="json").status_code, 403)


class Usuarios(Base):
    def test_debe_quedar_un_admin(self):
        c = self.como(self.admin)
        r = c.patch(f"/api/usuarios/{self.admin.pk}/", {"rol": self.roles["TRABAJADOR"].pk}, format="json")
        self.assertEqual(r.status_code, 400)
        otro = Usuario.objects.create_user("admin2", password="Clave-Segura-77", rol=self.roles["ADMIN"])
        r = c.patch(f"/api/usuarios/{otro.pk}/", {"rol": self.roles["COORDINACION"].pk}, format="json")
        self.assertEqual(r.status_code, 200)
        r = c.patch(f"/api/usuarios/{self.admin.pk}/", {"rol": self.roles["COORDINACION"].pk}, format="json")
        self.assertEqual(r.status_code, 400)  # otro ya no es admin: de nuevo queda solo este

    def test_no_se_deshabilita_a_si_mismo(self):
        r = self.como(self.admin).patch(f"/api/usuarios/{self.admin.pk}/", {"is_active": False}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_admin_restablece_password(self):
        r = self.como(self.admin).patch(f"/api/usuarios/{self.trab.pk}/", {"password": "Nueva-Clave-4521"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.trab.refresh_from_db()
        self.assertTrue(self.trab.check_password("Nueva-Clave-4521"))
        self.assertEqual(self.como(self.coord).get("/api/usuarios/").status_code, 403)

    def test_historial_paginado_y_filtrable(self):
        self.crear_trabajo()
        c = self.como(self.coord)
        self.assertEqual(c.get("/api/historial/?entidad=Trabajo").data["count"], 1)
        self.assertEqual(c.get("/api/historial/?entidad=Material").data["count"], 0)
        self.assertEqual(self.como(self.trab).get("/api/historial/").status_code, 403)


class Asignacion(Base):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.ana = Usuario.objects.create_user("ana", password="x-Clave-123", first_name="Ana", last_name="Soto",
                                              rol=cls.roles["TRABAJADOR"], area=cls.bordado)
        cls.luis = Usuario.objects.create_user("luis", password="x-Clave-123", first_name="Luis",
                                               rol=cls.roles["TRABAJADOR"], area=cls.grabado)

    def test_catalogo_lista_trabajadores(self):
        r = self.como(self.coord).get("/api/catalogos/")
        self.assertEqual({t["nombre"] for t in r.data["trabajadores"]}, {"Ana Soto", "Luis", "trab"})

    def test_asignar_al_crear_muestra_nombre_y_adopta_el_area(self):
        t = self.crear_trabajo(responsable=self.luis.pk, area_actual=None)
        self.assertEqual(t.area_actual, self.grabado)
        r = self.como(self.coord).get(f"/api/trabajos/{t.pk}/")
        self.assertEqual(r.data["responsable_nombre"], "Luis")
        self.assertIn("Asignado a Luis", t.historial.first().observacion)

    def test_responsable_de_otra_area_se_rechaza(self):
        r = self.como(self.coord).post("/api/trabajos/", {
            "cliente": "X", "descripcion": "d", "tipo_trabajo": "t", "cantidad_total": 1,
            "area_actual": self.bordado.pk, "responsable": self.luis.pk}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("trabaja en", str(r.data))

    def test_solo_coordinacion_asigna_en_seguimiento(self):
        t = self.crear_trabajo()
        url = f"/api/trabajos/{t.pk}/seguimiento/"
        r = self.como(self.trab).post(url, {"responsable": self.ana.pk}, format="json")  # trab es del área Bordado
        self.assertEqual(r.status_code, 403)
        r = self.como(self.coord).post(url, {"responsable": self.ana.pk, "observacion": "Urgente"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["responsable_nombre"], "Ana Soto")
        self.assertEqual(t.historial.first().observacion, "Urgente · Asignado a Ana Soto")

    def test_cambiar_el_area_quita_al_responsable(self):
        t = self.crear_trabajo(responsable=self.ana.pk)
        r = self.como(self.coord).post(f"/api/trabajos/{t.pk}/seguimiento/", {"area_actual": self.grabado.pk}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.data["responsable"])
        self.assertIn("Sin responsable", t.historial.first().observacion)

    def test_filtrar_por_responsable(self):
        suyo = self.crear_trabajo(responsable=self.ana.pk)
        libre = self.crear_trabajo()
        c = self.como(self.coord)
        ids = lambda q: [t["id"] for t in c.get("/api/trabajos/?" + q).data["results"]]
        self.assertEqual(ids(f"responsable={self.ana.pk}"), [suyo.pk])
        self.assertEqual(ids("responsable=none"), [libre.pk])

    def test_resumen_de_mis_trabajos(self):
        hoy = timezone.localdate()
        self.crear_trabajo(responsable=self.ana.pk, fecha_ingreso=(hoy - timedelta(days=9)).isoformat(),
                           fecha_comprometida=(hoy - timedelta(days=1)).isoformat())
        self.crear_trabajo(responsable=self.ana.pk)
        self.crear_trabajo()  # sin responsable
        c = self.como(self.ana)
        mio = c.get(f"/api/trabajos/resumen/?responsable={self.ana.pk}").data
        self.assertEqual((mio["en_curso"], mio["atrasados"]), (2, 1))
        self.assertEqual(c.get("/api/trabajos/resumen/").data["en_curso"], 3)  # sin filtro: todos
        self.assertEqual(c.get("/api/trabajos/resumen/?responsable=none").data["en_curso"], 1)

    def test_editar_trabajo_cambia_responsable(self):
        t = self.crear_trabajo()
        r = self.como(self.coord).patch(f"/api/trabajos/{t.pk}/", {"responsable": self.ana.pk}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn("responsable", t.historial.first().observacion)


class MovimientosYMateriales(Base):
    def setUp(self):
        super().setUp()
        self.m = Material.objects.create(nombre="Hilo", unidad_medida="conos", existencia_actual=10, stock_minimo=2)
        self.t = self.crear_trabajo()

    def salida(self, n, **extra):
        r = self.como(self.mat).post(f"/api/materiales/{self.m.pk}/movimiento/",
                                     {"tipo_movimiento": "SALIDA", "cantidad": n, "trabajo": self.t.pk, **extra}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        return self.m.movimientos.latest("id")

    def existencia(self):
        self.m.refresh_from_db()
        return self.m.existencia_actual

    def test_materiales_usados_en_un_trabajo(self):
        self.salida(3)
        r = self.como(self.trab).get(f"/api/movimientos/?trabajo={self.t.pk}")
        fila = r.data["results"][0]
        self.assertEqual((fila["material_nombre"], fila["unidad"], fila["trabajo"], fila["trabajo_id"]), ("Hilo", "conos", self.t.codigo, self.t.pk))

    def test_editar_movimiento_ajusta_existencia(self):
        mov = self.salida(3)  # 10 → 7
        c = self.como(self.mat)
        self.assertEqual(c.patch(f"/api/movimientos/{mov.pk}/", {"cantidad": "5", "observacion": "corregido"}, format="json").status_code, 200)
        self.assertEqual(self.existencia(), Decimal("5"))  # salió 5 en vez de 3
        self.assertEqual(c.patch(f"/api/movimientos/{mov.pk}/", {"cantidad": "11"}, format="json").status_code, 400)  # dejaría stock negativo
        self.assertEqual(self.existencia(), Decimal("5"))

    def test_eliminar_movimiento_devuelve_el_stock(self):
        mov = self.salida(4)
        self.assertEqual(self.existencia(), Decimal("6"))
        self.assertEqual(self.como(self.mat).delete(f"/api/movimientos/{mov.pk}/").status_code, 204)
        self.assertEqual(self.existencia(), Decimal("10"))

    def test_no_se_elimina_una_entrada_si_el_stock_ya_se_uso(self):
        c = self.como(self.mat)
        c.post(f"/api/materiales/{self.m.pk}/movimiento/", {"tipo_movimiento": "ENTRADA", "cantidad": 5}, format="json")
        entrada = self.m.movimientos.latest("id")
        self.salida(15)  # usa todo: 15 → 0
        self.assertEqual(c.delete(f"/api/movimientos/{entrada.pk}/").status_code, 400)

    def test_permisos_de_movimientos(self):
        mov = self.salida(1)
        self.assertEqual(self.como(self.coord).patch(f"/api/movimientos/{mov.pk}/", {"cantidad": "2"}, format="json").status_code, 403)
        self.assertEqual(self.como(self.trab).delete(f"/api/movimientos/{mov.pk}/").status_code, 403)

    def test_eliminar_material(self):
        c = self.como(self.mat)
        libre = Material.objects.create(nombre="Botones", unidad_medida="u", existencia_actual=1, stock_minimo=0)
        self.assertEqual(c.delete(f"/api/materiales/{libre.pk}/").status_code, 204)
        self.assertFalse(Material.objects.filter(pk=libre.pk).exists())
        self.assertEqual(self.como(self.trab).delete(f"/api/materiales/{self.m.pk}/").status_code, 403)

    def test_material_con_movimientos_no_se_elimina(self):
        self.salida(1)
        r = self.como(self.mat).delete(f"/api/materiales/{self.m.pk}/")
        self.assertEqual(r.status_code, 400)
        self.assertTrue(Material.objects.filter(pk=self.m.pk).exists())


class Salud(TestCase):
    def test_salud_publica_responde_ok(self):
        r = self.client.get("/api/salud/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {"ok": True})


class PermisosYRendimiento(Base):
    def test_me_informa_los_permisos_de_cada_rol(self):
        for usuario, rol in ((self.admin, "ADMIN"), (self.coord, "COORDINACION"), (self.mat, "MATERIALES"), (self.trab, "TRABAJADOR")):
            r = self.como(usuario).get("/api/auth/me/")
            self.assertEqual(r.data["permisos"], {a: rol in roles for a, roles in PERMISOS.items()})
        self.assertEqual(set(ROLES), set(self.roles))

    def test_permisos_del_servidor_siguen_la_tabla(self):
        # La tabla PERMISOS manda: quien no la tiene recibe 403 y quien la tiene no.
        datos = {"cliente": "X", "descripcion": "d", "tipo_trabajo": "t", "cantidad_total": 1}
        for usuario in (self.admin, self.coord, self.mat, self.trab):
            puede = usuario.rol.nombre_rol in PERMISOS["crear"]
            r = self.como(usuario).post("/api/trabajos/", datos, format="json")
            self.assertEqual(r.status_code == 201, puede, usuario.username)
            self.assertEqual(r.status_code == 403, not puede, usuario.username)

    def test_recalcular_todos_usa_pocas_consultas(self):
        for _ in range(12):
            self.crear_trabajo()
        with CaptureQueriesContext(connection) as ctx:
            recalcular_todos()
        self.assertLessEqual(len(ctx), 4)  # no crece con la cantidad de trabajos

    def test_unidades_siempre_suman_la_cantidad_total(self):
        t = self.crear_trabajo()
        c = self.como(self.coord)
        pasos = [("avanzar", 4), ("editar", 14), ("avanzar", 3), ("editar", 12), ("avanzar", 5)]
        for accion, n in pasos:
            if accion == "avanzar":
                c.post(f"/api/trabajos/{t.pk}/avanzar/", {"desde": self.estados[0].pk, "cantidad": n}, format="json")
            else:
                c.patch(f"/api/trabajos/{t.pk}/", {"cantidad_total": n}, format="json")
            t.refresh_from_db()
            total = sum(a.cantidad for a in AvanceEtapa.objects.filter(trabajo=t))
            self.assertEqual(total, t.cantidad_total, (accion, n))
