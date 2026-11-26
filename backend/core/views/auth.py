
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .. import serializers as S
from ..models import (
    Area,
    Estado,
    Rol,
    registrar,
)
from ..serializers import nombre_de
from ._base import log, perfil


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    permission_classes, authentication_classes = [AllowAny], []

    def get(self, request):
        return Response({"ok": True})


class SaludView(APIView):
    """Para monitoreo: responde 200 si la app y la base de datos funcionan."""
    permission_classes, authentication_classes = [AllowAny], []

    def get(self, request):
        try:
            Rol.objects.exists()
        except Exception:
            log.exception("Chequeo de salud falló")
            return Response({"ok": False}, status=503)
        return Response({"ok": True})


class LoginView(APIView):
    permission_classes, authentication_classes = [AllowAny], []
    throttle_classes, throttle_scope = [ScopedRateThrottle], "login"

    def post(self, request):
        nombre = str(request.data.get("username", ""))
        u = authenticate(request, username=nombre, password=request.data.get("password", ""))
        if not u or not u.is_active:
            log.warning("Login fallido para %r desde %s", nombre[:50], request.META.get("REMOTE_ADDR"))
            raise ValidationError({"detail": "Usuario o contraseña incorrectos."})
        login(request, u)
        return Response(perfil(u))


class LogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response(status=204)


class MeView(APIView):
    def get(self, request):
        return Response(perfil(request.user))


class PasswordView(APIView):
    """Cada persona cambia su propia contraseña."""
    throttle_classes, throttle_scope = [ScopedRateThrottle], "password"

    def post(self, request):
        s = S.CambiarPasswordSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        u = request.user
        if not u.check_password(s.validated_data["actual"]):
            raise ValidationError({"actual": "La contraseña actual no es correcta."})
        try:
            validate_password(s.validated_data["nueva"], u)
        except DjangoValidationError as e:
            raise ValidationError({"nueva": list(e.messages)})
        u.set_password(s.validated_data["nueva"])
        u.save(update_fields=["password"])
        update_session_auth_hash(request, u)  # no cierra la sesión actual
        registrar(u, "Usuario", u.pk, "PASSWORD", f"{u.username} cambió su contraseña")
        return Response(status=204)


class CatalogosView(APIView):
    def get(self, request):
        return Response({
            "estados": S.EstadoSerializer(Estado.objects.filter(activo=True), many=True).data,
            "areas": S.AreaSerializer(Area.objects.filter(activo=True), many=True).data,
            "roles": S.RolSerializer(Rol.objects.all(), many=True).data,
            "trabajadores": [{"id": u.pk, "nombre": nombre_de(u), "area": u.area_id}
                             for u in S.TRABAJADORES.order_by("first_name", "username")],
        })
