# syntax=docker/dockerfile:1

# --- Stage 1: build the React SPA ---
FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build   # outputs client/dist

# --- Stage 2: Django + gunicorn serving the API and the built SPA ---
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /app

COPY server/requirements.txt ./
RUN pip install -r requirements.txt

COPY server/ ./
# Built SPA → server/spa (WhiteNoise serves assets; config.urls serves index.html)
COPY --from=client-build /app/client/dist ./spa

# Collect Django/admin/DRF/Swagger static. SECRET_KEY/DEBUG here are throwaway
# build-time values (real ones come from the environment at runtime).
RUN SECRET_KEY=build-only DEBUG=False python manage.py collectstatic --noinput

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Run as a non-root user; 8000 is unprivileged and nothing needs write access
# outside /app after the build steps above.
RUN useradd --create-home --uid 1000 app && chown -R app:app /app
USER app

EXPOSE 8000
ENTRYPOINT ["docker-entrypoint.sh"]
# --timeout 120: AI requests (Claude) can exceed gunicorn's 30s default. Log to stdout for CloudWatch.
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "120", "--access-logfile", "-"]
