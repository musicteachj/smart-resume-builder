#!/bin/sh
set -e

# Apply migrations on startup (this also creates the throttle cache table), then run
# the given command (gunicorn). Fine for a single task and for local compose. In production
# set RUN_MIGRATIONS=0 on the service and run `migrate` as a one-off task before updating
# it; the hourly `cleanup_demo` task runs the same way (see docs/DEPLOYMENT.md).
if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  python manage.py migrate --noinput
fi

exec "$@"
