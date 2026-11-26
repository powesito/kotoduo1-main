
import os
import sys
from pathlib import Path

from decouple import AutoConfig
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
config = AutoConfig(search_path=BASE_DIR)


def env_bool(nombre, defecto=False):
    return config(nombre, default=defecto, cast=bool)


DEBUG = env_bool("DEBUG", False)

_CLAVE_DEV = "solo-desarrollo-cambiar-en-produccion"
SECRET_KEY = config("SECRET_KEY", default="")

if not DEBUG and (not SECRET_KEY or SECRET_KEY == _CLAVE_DEV):
    raise ImproperlyConfigured(
        "Con DEBUG=0 debes definir SECRET_KEY con un valor largo y secreto."
    )

SECRET_KEY = SECRET_KEY or _CLAVE_DEV

ALLOWED_HOSTS = config(
    "ALLOWED_HOSTS",
    default="localhost,127.0.0.1"
).split(",")

CSRF_TRUSTED_ORIGINS = [
    origen.strip()
    for origen in config("CSRF_TRUSTED_ORIGINS", default="").split(",")
    if origen.strip()
]

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "rest_framework",
    "core",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
AUTH_USER_MODEL = "core.Usuario"

DB_NAME = config("DB_NAME", default="")

if DB_NAME:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.mysql",
            "NAME": DB_NAME,
            "USER": config("DB_USER", default="root"),
            "PASSWORD": config("DB_PASSWORD", default=""),
            "HOST": config("DB_HOST", default="127.0.0.1"),
            "PORT": config("DB_PORT", default="3306"),
            "OPTIONS": {
                "charset": "utf8mb4",
                "init_command": "SET sql_mode='STRICT_ALL_TABLES'",
            },
            "ATOMIC_REQUESTS": True,
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
            "ATOMIC_REQUESTS": True,
        }
    }

CACHE_DIR = config("CACHE_DIR", default=str(BASE_DIR / ".cache"))

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.filebased.FileBasedCache",
        "LOCATION": CACHE_DIR,
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"
    },
]

LANGUAGE_CODE = "es-cl"
TIME_ZONE = "America/Santiago"
USE_TZ = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

SESSION_COOKIE_AGE = config("SESSION_HORAS", default=12, cast=int) * 3600
SESSION_SAVE_EVERY_REQUEST = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = not DEBUG

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = env_bool("SSL_REDIRECT", True)
    SECURE_HSTS_SECONDS = config("HSTS_SECONDS", default=0, cast=int)

SILENCED_SYSTEM_CHECKS = ["security.W005", "security.W021"]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["core.auth.SesionAuth"],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated"
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer"
    ],
    "DEFAULT_THROTTLE_RATES": {
        "login": "10/min",
        "password": "10/min",
    },
    "NUM_PROXIES": config(
        "NUM_PROXIES",
        default=0 if DEBUG else 1,
        cast=int,
    ),
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "std": {
            "format": "%(asctime)s %(levelname)s %(name)s: %(message)s"
        }
    },
    "handlers": {
        "consola": {
            "class": "logging.StreamHandler",
            "formatter": "std",
        }
    },
    "root": {
        "handlers": ["consola"],
        "level": (
            "CRITICAL"
            if "test" in sys.argv
            else config("LOG_LEVEL", default="INFO")
        ),
    },
}
