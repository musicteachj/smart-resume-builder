#!/bin/sh
set -e

# Apply migrations on startup (this also creates the throttle cache table), then run
# the given command (gunicorn). Fine for a single task. With more than one task,
# concurrent startups race on migrate: set RUN_MIGRATIONS=0 on the service and run
# `migrate` as a one-off ECS task in the deploy workflow before updating the service.
if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  python manage.py migrate --noinput
fi

exec "$@"
