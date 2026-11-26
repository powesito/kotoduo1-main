from rest_framework.authentication import SessionAuthentication


class SesionAuth(SessionAuthentication):
    """Igual que SessionAuthentication, pero responde 401 (no 403) cuando no hay sesión,
    para que el frontend distinga "sesión expirada" de "sin permiso"."""

    def authenticate_header(self, request):
        return "Session"
