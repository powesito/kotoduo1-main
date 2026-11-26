# Kotoduo · Sistema de seguimiento de producción

React (Vite) + Django REST Framework + MySQL 8 (SQLite en desarrollo). Basado en el Informe 2.

## Desarrollo

**Backend**

    cd backend
    python -m venv .venv && source .venv/bin/activate
    export DEBUG=1                          # sin esto la app corre como producción y exige SECRET_KEY
    pip install -r requirements-dev.txt     # con MySQL: requirements-mysql.txt
    python manage.py migrate
    python manage.py seed                   # etapas, áreas y (solo con DEBUG=1) usuarios y trabajos de ejemplo
    python manage.py runserver

Usuarios de ejemplo: `admin`, `coordinacion`, `materiales`, `trabajador` · contraseña `kotoduo123`.
`seed` fija esa contraseña solo al crear la cuenta; nunca pisa la de una cuenta existente.

**Frontend** (necesita Node 22.12 o superior)

    cd frontend
    npm install
    npm run dev                             # http://localhost:5173 (reenvía /api a Django)

**Pruebas y calidad**

    cd backend  && DEBUG=1 python manage.py test core && ruff check .
    cd frontend && npm test && npm run format:check

## Qué hace

| Rol | Puede |
|---|---|
| ADMIN | Todo, incluidas cuentas (rol, área, restablecer contraseña) |
| COORDINACION | Registrar, editar, anular y asignar trabajos; mover unidades; etapas; historial; registrar movimientos de material |
| MATERIALES | Materiales (crear, editar, desactivar, eliminar) y sus movimientos (registrar, corregir, eliminar) |
| TRABAJADOR | Mover unidades y actualizar seguimiento de trabajos **de su área** |

- **Trabajos**: avance por unidades entre etapas; fecha de entrega con etiquetas *Atrasado*, *Vence hoy* y *Vence mañana* (el umbral es `DIAS_ALERTA` en `core/views/trabajos.py`); resumen clicable (en curso, finalizados, atrasados, vencen hoy o mañana); filtros por etapa, área, responsable y vista (En curso / Finalizados / Anulados); orden por entrega; paginación; edición; anulación con motivo y restauración. Al mover la última unidad a la etapa final, el trabajo pasa solo a **Finalizados** y la pantalla lo avisa.
- **Vista del trabajador**: al entrar ve **Mis trabajos** (lo asignado a él, por fecha de entrega) con sus contadores, y puede cambiar a *Todos*. Cada trabajo muestra en grande la **etapa actual** y las unidades en ella; mover unidades, seguimiento, materiales e historial quedan plegados. En el celular la lista y el detalle se alternan.
- **Actualización automática**: la lista, los contadores y el trabajo abierto se recargan solos cada 45 s (constante `REFRESCO_MS` en `frontend/src/pages/Trabajos.jsx`), solo con la pestaña visible; no toca lo que se esté escribiendo. Hay un botón «Actualizar ahora».
- **Asignación**: Coordinación y Administración asignan cada trabajo a una persona (rol TRABAJADOR) al registrarlo o desde el seguimiento; su nombre aparece en la lista y en el detalle. La persona debe ser del área del trabajo; si se cambia el área, se quita al responsable. Cada asignación queda en el historial.
- **Materiales**: existencias con alerta de stock mínimo; entradas y salidas, opcionalmente ligadas a un trabajo; historial de movimientos; editar, desactivar y eliminar materiales (solo se elimina si no tiene movimientos; si los tiene, se desactiva). Los movimientos se pueden corregir o eliminar (ADMIN y MATERIALES) y la existencia se ajusta sola, sin quedar nunca negativa.
- **Materiales por trabajo**: el detalle de cada trabajo lista los materiales usados, con el total por material, y permite registrar nuevos consumos o devoluciones.
- **Seguridad**: permisos validados en el servidor, sesión con cookie + CSRF, 401 al caducar la sesión, límite de intentos de login y de cambio de contraseña, siempre al menos un administrador activo.
- **Tema claro/oscuro**: botón en la barra superior (y en la pantalla de login). Recuerda la elección en cada navegador y, la primera vez, sigue la preferencia del sistema. El logo tiene una versión para fondo oscuro (`frontend/src/assets/logo-oscuro.png`); los colores de ambos temas están como variables al inicio de `styles.css`.
- La URL refleja la pantalla (`#/trabajos/12`), así que se puede recargar o compartir el enlace de un trabajo.

## Producción

1. Copia `.env.example` a `/etc/kotoduo.env` y complétalo. **Con `DEBUG=0` la app no arranca sin `SECRET_KEY`.**
2. Backend: `pip install -r requirements.lock -r requirements-mysql.txt` (el `.lock` fija las versiones probadas; se regenera con `pip-compile requirements.txt -o requirements.lock --strip-extras`), `python manage.py migrate`, `python manage.py seed` (en producción solo crea etapas y áreas) y `python manage.py createsuperuser` para el primer administrador.
3. Frontend: `cd frontend && npm ci && npm run build` → carpeta `dist/`.
4. Servicio y proxy: ver `deploy/kotoduo.service.example` (gunicorn) y `deploy/nginx.conf.example` (sirve `dist/` y reenvía `/api/`). Frontend y API deben compartir dominio por las cookies de sesión.
5. Respaldos: `deploy/backup_mysql.sh` desde cron. Define `RCLONE_DESTINO` o `RSYNC_DESTINO` para que copie cada respaldo fuera del servidor, y prueba restaurar de vez en cuando.
   Monitoreo: `GET /health` (vía nginx) o `/api/salud/` responde 200 si la app y la base de datos funcionan.
6. Comprueba la configuración con `DEBUG=0 python manage.py check --deploy`. El único aviso esperado es HSTS; actívalo (`HSTS_SECONDS`) cuando HTTPS funcione bien. (Se silencian a propósito `W005` y `W021`: HSTS en subdominios y precarga pueden afectar a otros sitios de tu dominio.)

## Notas de diseño

- Los **permisos por rol** están solo en `backend/core/roles.py`: el servidor los aplica y el frontend los recibe en `/api/auth/me/` (campo `permisos`); no se repiten en la interfaz.
- Los **estados** del modelo son las **etapas** de la interfaz y de la API (`/api/etapas/`); se mantuvo el nombre del modelo para no migrar toda la base.
- Hay dos registros distintos a propósito: `HistorialEstado` es la línea de tiempo de cada trabajo (la ve el equipo, con un `tipo`: registro, avance, seguimiento, edición, anulación) y `HistorialCambio` es la auditoría global para Administración/Coordinación.
- `Trabajo.estado` y `Trabajo.completado` se derivan de las unidades por etapa (`core/servicios.py::sincronizar`); no se editan a mano.
- La tipografía (Schibsted Grotesk) va incluida en la app con `@fontsource`: no se contacta a Google y la CSP es solo `'self'`.
- Editar un trabajo, mover unidades y el seguimiento bloquean la fila del trabajo (`select_for_update`), así que dos personas actuando a la vez no descuadran las cantidades (en MySQL; SQLite lo ignora).
- Cada petición HTTP corre en una transacción (`ATOMIC_REQUESTS`): si algo falla a medias, se deshace todo.
