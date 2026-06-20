#!/bin/sh
set -e

# Apply migrations on startup, then run the given command (gunicorn).
python manage.py migrate --noinput

exec "$@"
