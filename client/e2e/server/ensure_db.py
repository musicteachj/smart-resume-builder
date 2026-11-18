"""Create the e2e database if it doesn't exist yet (CI's Postgres service creates it up front).

Usage: python ensure_db.py  (reads E2E_DATABASE_URL, same default as e2e_settings.py)
"""

import os
from urllib.parse import urlparse

import psycopg
from psycopg import sql

url = urlparse(
    os.environ.get(
        "E2E_DATABASE_URL",
        "postgres://resume_user:resume_pass@localhost:5432/resume_builder_e2e",
    )
)
name = url.path.lstrip("/")
with psycopg.connect(
    host=url.hostname,
    port=url.port or 5432,
    user=url.username,
    password=url.password,
    dbname="postgres",
    autocommit=True,
) as conn:
    exists = conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (name,)).fetchone()
    if not exists:
        conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
        print(f"Created database {name}")
