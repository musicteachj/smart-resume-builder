# Smart Resume Builder

Smart Resume Builder is an AI-assisted resume creation platform that pairs a modern React editor with a secure Node/Express backend. This repository is structured as a pnpm-powered monorepo so we can share types, schemas, and utilities across the stack while keeping deployments streamlined.

## Repository layout

- `apps/client` – React 18 + Vite frontend (authentication, dashboard, editor, preview)
- `apps/server` – Node.js + Express backend (API, auth, PDF generation, AI integrations)
- `packages/shared` – Shared TypeScript types, schemas, and UI primitives
- `prisma` – Prisma schema, migrations, and database utilities
- `.github/workflows` – CI/CD automation (configured in later phases)

## Getting started

1. Install [pnpm](https://pnpm.io/) if you have not already.
2. Install dependencies: `pnpm install`
3. Run workspace tasks via the root scripts (see below)

> The detailed build plan lives in `RESUME_BUILDER_IMPLEMENTATION_GUIDE 1.md`. Work through each phase sequentially and commit after completing a phase.

## Workspace scripts

- `pnpm dev` – (placeholder) Runs client and server once those packages are implemented
- `pnpm build` – Runs `build` in every workspace package
- `pnpm lint` – Runs `lint` in every workspace package
- `pnpm test` – Runs `test` in every workspace package
- `pnpm format` – Runs `format` in every workspace package
- `pnpm typecheck` – Runs `typecheck` in every workspace package

Each package will define its own scripts in later phases; these root commands orchestrate them via pnpm workspaces.

