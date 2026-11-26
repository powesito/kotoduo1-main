"""Roles y permisos: única fuente de verdad. El servidor los aplica y el frontend los recibe en /api/auth/me/."""

ADMIN, COORD, MAT, TRAB = "ADMIN", "COORDINACION", "MATERIALES", "TRABAJADOR"
ROLES = (ADMIN, COORD, MAT, TRAB)

# Qué roles pueden hacer cada cosa.
PERMISOS = {
    "crear": (ADMIN, COORD),  # registrar trabajos
    "editar": (ADMIN, COORD),  # editar, anular y restaurar trabajos
    "seguimiento": (ADMIN, COORD, TRAB),  # mover unidades y actualizar seguimiento
    "movimientos": (ADMIN, COORD, MAT),  # registrar movimientos de material
    "material": (ADMIN, MAT),  # crear/editar/eliminar materiales y corregir movimientos
    "admin": (ADMIN,),  # cuentas de usuario
    "historial": (ADMIN, COORD),  # auditoría global
    "etapas": (ADMIN, COORD),  # administrar etapas
}


def permisos_de(rol):
    return {accion: rol in roles for accion, roles in PERMISOS.items()}
