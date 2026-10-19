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

# The hash-checked lock pins every transitive dependency too (see its header).
COPY server/requirements.txt ./
RUN pip install --require-hashes -r requirements.txt

COPY server/ ./
# Built SPA → server/spa (WhiteNoise serves assets; config.urls serves index.html)
COPY --from=client-build /app/client/dist ./spa
# Precompress (gzip + brotli) so WhiteNoise can serve them: it only compresses
# STATIC_ROOT itself, and the ALB doesn't compress. Roughly 3x fewer bytes.
RUN python -m whitenoise.compress spa

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
# gthread: AI calls block for up to ~100s, and with sync workers three of them left
# nothing to answer /health, so the ALB would replace the task. 2 workers x 8 threads
# = 16 requests in flight per task (the Anthropic client is thread-safe).
# --keep-alive must exceed the ALB idle timeout (120s) or the ALB sees stray 502s.
# --graceful-timeout lets in-flight AI calls finish on deploy (ECS stopTimeout 120).
# Log to stdout for CloudWatch.
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", \
     "--worker-class", "gthread", "--workers", "2", "--threads", "8", \
     "--timeout", "120", "--keep-alive", "185", "--graceful-timeout", "110", \
     "--access-logfile", "-"]
