from decimal import Decimal

from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from rest_framework import serializers

from .models import Area, Estado, HistorialCambio, HistorialEstado, Material, MovimientoMaterial, Rol, Trabajo, Usuario
from .roles import TRAB
from .servicios import mapa_en_uso

TRABAJADORES = Usuario.objects.filter(is_active=True, rol__nombre_rol=TRAB)


def nombre_de(u):
    return (u.get_full_name() or u.username) if u else None


class AreaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Area
        fields = ["id", "nombre_area"]


class EstadoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Estado
        fields = ["id", "nombre_estado", "orden"]


class RolSerializer(serializers.ModelSerializer):
    class Meta:
        model = Rol
        fields = ["id", "nombre_rol"]


class TrabajoSerializer(serializers.ModelSerializer):
    estado_nombre = serializers.CharField(source="estado.nombre_estado", read_only=True)
    area_nombre = serializers.CharField(source="area_actual.nombre_area", read_only=True, default=None)
    responsable = serializers.PrimaryKeyRelatedField(queryset=TRABAJADORES, required=False, allow_null=True)
    responsable_nombre = serializers.SerializerMethodField()
    avance = serializers.SerializerMethodField()
    entregadas = serializers.SerializerMethodField()
    dias_para_entrega = serializers.SerializerMethodField()
    etapas = serializers.PrimaryKeyRelatedField(many=True, queryset=Estado.objects.filter(activo=True), required=False)

    def get_responsable_nombre(self, t):
        return nombre_de(t.responsable)

    def _avance(self, t):
        return {a.estado_id: a.cantidad for a in t.avance.all() if a.cantidad}

    def get_avance(self, t):
        return {str(k): v for k, v in self._avance(t).items()}

    def get_entregadas(self, t):
        etapas = sorted(t.etapas.all(), key=lambda e: e.orden)
        etapas = [e for e in etapas if e.activo] or etapas
        return self._avance(t).get(etapas[-1].pk, 0) if etapas else 0

    def get_dias_para_entrega(self, t):
        if not t.fecha_comprometida or t.completado or t.anulado:
            return None
        return (t.fecha_comprometida - timezone.localdate()).days

    class Meta:
        model = Trabajo
        fields = ["id", "codigo", "cliente", "descripcion", "tipo_trabajo", "fecha_ingreso",
                  "fecha_comprometida", "estado", "estado_nombre", "area_actual", "area_nombre",
                  "proxima_actividad", "observaciones", "cantidad_total", "avance", "etapas", "entregadas", "responsable",
                  "responsable_nombre",
                  "completado", "anulado", "motivo_anulacion", "dias_para_entrega"]
        read_only_fields = ["codigo", "estado", "proxima_actividad", "completado", "anulado", "motivo_anulacion"]

    def validate(self, a):
        ingreso = a.get("fecha_ingreso") or (self.instance.fecha_ingreso if self.instance else timezone.localdate())
        if ingreso > timezone.localdate():
            raise serializers.ValidationError({"fecha_ingreso": "No puede ser posterior a hoy."})
        comprometida = a["fecha_comprometida"] if "fecha_comprometida" in a else (
            self.instance.fecha_comprometida if self.instance else None)
        if comprometida and comprometida < ingreso:
            raise serializers.ValidationError({"fecha_comprometida": "Debe ser igual o posterior al ingreso."})
        return a


class SeguimientoSerializer(serializers.Serializer):
    area_actual = serializers.PrimaryKeyRelatedField(queryset=Area.objects.filter(activo=True),
                                                     allow_null=True, required=False)
    proxima_actividad = serializers.CharField(max_length=200, allow_blank=True, required=False)
    responsable = serializers.PrimaryKeyRelatedField(queryset=TRABAJADORES, allow_null=True, required=False)
    observacion = serializers.CharField(max_length=300, allow_blank=True, required=False, default="")


class AnularSerializer(serializers.Serializer):
    motivo = serializers.CharField(max_length=300)


class EstadoAdminSerializer(serializers.ModelSerializer):
    en_uso = serializers.SerializerMethodField()

    class Meta:
        model = Estado
        fields = ["id", "nombre_estado", "orden", "activo", "en_uso"]
        read_only_fields = ["orden"]

    def get_en_uso(self, e):
        # Un solo conteo por respuesta (no una consulta por etapa).
        if "en_uso" not in self.context:
            self.context["en_uso"] = mapa_en_uso()
        return self.context["en_uso"].get(e.pk, 0)


class MoverSerializer(serializers.Serializer):
    desde = serializers.PrimaryKeyRelatedField(queryset=Estado.objects.filter(activo=True))
    hacia = serializers.PrimaryKeyRelatedField(queryset=Estado.objects.filter(activo=True), required=False)
    cantidad = serializers.IntegerField(min_value=1)
    observacion = serializers.CharField(max_length=250, allow_blank=True, required=False, default="")


class HistorialEstadoSerializer(serializers.ModelSerializer):
    usuario = serializers.CharField(source="usuario.username")
    estado_anterior = serializers.CharField(source="estado_anterior.nombre_estado", default=None)
    estado_nuevo = serializers.CharField(source="estado_nuevo.nombre_estado")

    class Meta:
        model = HistorialEstado
        fields = ["id", "tipo", "usuario", "estado_anterior", "estado_nuevo", "fecha_hora", "observacion"]


class MaterialSerializer(serializers.ModelSerializer):
    stock_bajo = serializers.BooleanField(read_only=True)

    class Meta:
        model = Material
        fields = ["id", "nombre", "unidad_medida", "existencia_actual", "stock_minimo", "activo", "stock_bajo"]
        read_only_fields = ["existencia_actual"]

    def validate_stock_minimo(self, v):
        if v < 0:
            raise serializers.ValidationError("No puede ser negativo.")
        return v


class MovimientoSerializer(serializers.ModelSerializer):
    cantidad = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    trabajo = serializers.PrimaryKeyRelatedField(queryset=Trabajo.objects.filter(anulado=False),
                                                 required=False, allow_null=True)

    class Meta:
        model = MovimientoMaterial
        fields = ["tipo_movimiento", "cantidad", "observacion", "trabajo"]


class MovimientoListaSerializer(serializers.ModelSerializer):
    usuario = serializers.CharField(source="usuario.username")
    trabajo = serializers.CharField(source="trabajo.codigo", default=None)
    material_nombre = serializers.CharField(source="material.nombre")
    unidad = serializers.CharField(source="material.unidad_medida")

    class Meta:
        model = MovimientoMaterial
        fields = ["id", "material", "material_nombre", "unidad", "tipo_movimiento", "cantidad", "fecha_hora", "usuario",
                  "observacion", "trabajo", "trabajo_id"]


class MovimientoEditarSerializer(serializers.ModelSerializer):
    cantidad = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"), required=False)
    trabajo = serializers.PrimaryKeyRelatedField(queryset=Trabajo.objects.filter(anulado=False),
                                                 required=False, allow_null=True)

    class Meta:
        model = MovimientoMaterial
        fields = ["cantidad", "observacion", "trabajo"]


class UsuarioSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)
    rol_nombre = serializers.CharField(source="rol.nombre_rol", read_only=True, default=None)
    area_nombre = serializers.CharField(source="area.nombre_area", read_only=True, default=None)

    class Meta:
        model = Usuario
        fields = ["id", "username", "first_name", "last_name", "rol", "rol_nombre", "area", "area_nombre",
                  "is_active", "password"]

    def validate_password(self, v):
        validate_password(v, self.instance)
        return v

    def create(self, data):
        if "password" not in data:
            raise serializers.ValidationError({"password": "Obligatoria al crear la cuenta."})
        return Usuario.objects.create_user(**data)

    def update(self, obj, data):
        pw = data.pop("password", None)
        obj = super().update(obj, data)
        if pw:
            obj.set_password(pw)
            obj.save(update_fields=["password"])
        return obj


class CambiarPasswordSerializer(serializers.Serializer):
    actual = serializers.CharField()
    nueva = serializers.CharField()


class HistorialCambioSerializer(serializers.ModelSerializer):
    usuario = serializers.CharField(source="usuario.username", default=None)

    class Meta:
        model = HistorialCambio
        fields = ["id", "usuario", "entidad", "id_registro", "accion", "fecha_hora", "detalle_resumido"]
