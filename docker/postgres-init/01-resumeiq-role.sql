-- Mirrors the shared production server (design 5.5): the runtime role is not a superuser and owns its database.
-- Since PostgreSQL 15, PUBLIC can't create in schema public, so the database must be owned by the app role.
CREATE ROLE resumeiq LOGIN PASSWORD 'resumeiq_local_only';
CREATE DATABASE resumeiq OWNER resumeiq;
REVOKE CONNECT ON DATABASE resumeiq FROM PUBLIC;
