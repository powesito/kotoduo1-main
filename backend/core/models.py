import uuid

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import F, Q
from django.utils import timezone


class Rol(models.Model):
    nombre_rol = models.CharField(max_length=40, unique=True)
    descripcion = models.CharField(max_length=200, blank=True)

    def __str__(self):
        return self.nombre_rol


class Area(models.Model):
    nombre_area = models.CharField(max_length=60, unique=True)
    descripcion = models.CharField(max_length=200, blank=True)
    activo = models.BooleanField(default=True)

    def __str__(self):
        return self.nombre_area


class Estado(models.Model):
    nombre_estado = models.CharField(max_length=40, unique=True)
    orden = models.PositiveSmallIntegerField(default=0)
    activo = models.BooleanField(default=True)

    class Meta:
        ordering = ["orden"]

    def __str__(self):
        return self.nombre_estado


class Usuario(AbstractUser):
    rol = models.ForeignKey(Rol, null=True, blank=True, on_delete=models.PROTECT)
    area = models.ForeignKey(Area, null=True, blank=True, on_delete=models.PROTECT)


class Trabajo(models.Model):
    codigo = models.CharField(max_length=30, unique=True, blank=True)
    cliente = models.CharField(max_length=120)
    descripcion = models.TextField()
    tipo_trabajo = models.CharField(max_length=60)
    cantidad_total = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    fecha_ingreso = models.DateField(default=timezone.localdate)
    fecha_comprometida = models.DateField(null=True, blank=True)
    estado = models.ForeignKey(Estado, on_delete=models.PROTECT)
    area_actual = models.ForeignKey(Area, null=True, blank=True, on_delete=models.PROTECT)
    etapas = models.ManyToManyField(Estado, related_name="trabajos", blank=True)
    proxima_actividad = models.CharField(max_length=200, blank=True)
    observaciones = models.TextField(blank=True)
    responsable = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name="trabajos_asignados")
    completado = models.BooleanField(default=False)  # todas las unidades están en la última etapa
    anulado = models.BooleanField(default=False)
    motivo_anulacion = models.CharField(max_length=300, blank=True)

    class Meta:
        indexes = [models.Index(fields=["estado"]), models.Index(fields=["area_actual"]),
                   models.Index(fields=["fecha_comprometida"]), models.Index(fields=["anulado", "completado"])]
        constraints = [models.CheckConstraint(
            condition=Q(fecha_comprometida__isnull=True) | Q(fecha_comprometida__gte=F("fecha_ingreso")),
            name="fecha_comprometida_valida")]

    def save(self, *args, **kwargs):
        nuevo = self.pk is None and not self.codigo
        if nuevo:
            self.codigo = "tmp-" + uuid.uuid4().hex[:20]
        super().save(*args, **kwargs)
        if nuevo:
            self.codigo = f"KT-{self.pk:04d}"
            super().save(update_fields=["codigo"])


class HistorialEstado(models.Model):
    """Línea de tiempo de un trabajo (la ve el equipo). El registro global de auditoría es HistorialCambio."""
    REGISTRO, AVANCE, SEGUIMIENTO, EDICION, ANULACION = "REGISTRO", "AVANCE", "SEGUIMIENTO", "EDICION", "ANULACION"
    trabajo = models.ForeignKey(Trabajo, on_delete=models.CASCADE, related_name="historial")
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    estado_anterior = models.ForeignKey(Estado, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    estado_nuevo = models.ForeignKey(Estado, on_delete=models.PROTECT, related_name="+")
    fecha_hora = models.DateTimeField(auto_now_add=True)
    observacion = models.CharField(max_length=300, blank=True)
    tipo = models.CharField(max_length=12, default=AVANCE, choices=[
        (REGISTRO, "Registro"), (AVANCE, "Avance"), (SEGUIMIENTO, "Seguimiento"),
        (EDICION, "Edición"), (ANULACION, "Anulación")])

    class Meta:
        ordering = ["-fecha_hora", "-id"]


class Material(models.Model):
    nombre = models.CharField(max_length=120, unique=True)
    unidad_medida = models.CharField(max_length=20)
    existencia_actual = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    stock_minimo = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    activo = models.BooleanField(default=True)

    class Meta:
        ordering = ["nombre"]
        constraints = [
            models.CheckConstraint(condition=Q(existencia_actual__gte=0), name="existencia_no_negativa"),
            models.CheckConstraint(condition=Q(stock_minimo__gte=0), name="stock_minimo_no_negativo"),
        ]

    @property
    def stock_bajo(self):
        return self.existencia_actual <= self.stock_minimo


class MovimientoMaterial(models.Model):
    ENTRADA, SALIDA = "ENTRADA", "SALIDA"
    material = models.ForeignKey(Material, on_delete=models.PROTECT, related_name="movimientos")
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    tipo_movimiento = models.CharField(max_length=10, choices=[(ENTRADA, "Entrada"), (SALIDA, "Salida")])
    cantidad = models.DecimalField(max_digits=12, decimal_places=2)
    fecha_hora = models.DateTimeField(auto_now_add=True)
    observacion = models.CharField(max_length=300, blank=True)
    trabajo = models.ForeignKey(Trabajo, null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(cantidad__gt=0), name="cantidad_positiva")]


class HistorialCambio(models.Model):
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    entidad = models.CharField(max_length=40)
    id_registro = models.BigIntegerField()
    accion = models.CharField(max_length=40)
    fecha_hora = models.DateTimeField(auto_now_add=True)
    detalle_resumido = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["-fecha_hora", "-id"]


def registrar(usuario, entidad, id_registro, accion, detalle=""):
    HistorialCambio.objects.create(usuario=usuario, entidad=entidad, id_registro=id_registro,
                                   accion=accion, detalle_resumido=detalle[:300])


class AvanceEtapa(models.Model):
    """Unidades del trabajo que están actualmente en cada etapa."""
    trabajo = models.ForeignKey(Trabajo, on_delete=models.CASCADE, related_name="avance")
    estado = models.ForeignKey(Estado, on_delete=models.PROTECT, related_name="+")
    cantidad = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["trabajo", "estado"], name="avance_unico")]
