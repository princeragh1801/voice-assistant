# Jarvis

A personal voice work assistant, built incrementally. This is **Phase 0 — Foundation**: a working monorepo with a React frontend, an Express/TypeScript backend, and Postgres via Prisma, wired end-to-end. No voice, chat, tasks, or agents yet — see [docs/architecture.md](docs/architecture.md) for the full roadmap.

## Stack

- **Frontend:** React + TypeScript + Vite (`apps/web`)
- **Backend:** Node.js + Express + TypeScript (`apps/api`)
- **Database:** PostgreSQL (via Docker Compose)
- **ORM:** Prisma
- **Monorepo:** Turborepo + npm workspaces

## Prerequisites

- Node.js 22+
- Docker + Docker Compose

## Getting started

```bash
git clone <repo-url>
cd jarvis

npm install

cp .env.example .env
docker compose up -d

# generate the Prisma client and apply migrations
npm run db:generate
npm run db:migrate

npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:4000/api/health

The frontend calls `/api/health` through Vite's dev-server proxy (no CORS setup needed). You should see the API status, database connection state, and uptime rendered on the page.

## Scripts (run from the repo root)

| Command | What it does |
|---|---|
| `npm run dev` | Starts `apps/web` and `apps/api` together via Turborepo |
| `npm run build` | Builds all apps/packages |
| `npm run lint` | Lints all workspaces (ESLint flat config) |
| `npm run typecheck` | Type-checks all workspaces |
| `npm run format` | Formats the repo with Prettier |
| `npm run db:generate` | Regenerates the Prisma client (`apps/api`) |
| `npm run db:migrate` | Runs `prisma migrate dev` (`apps/api`) |
| `npm run db:studio` | Opens Prisma Studio |

## Project structure

```
apps/
  web/      React + Vite + TypeScript frontend
  api/      Express + TypeScript backend
packages/
  types/    Shared TypeScript types
  shared/   Shared runtime constants
  config/   Shared ESLint + TypeScript configs
docs/
  architecture.md   Full phase-by-phase roadmap
```

## Environment variables

See `.env.example`. A single `.env` file lives at the repo root and is used by both `docker-compose.yml` and `apps/api` (Prisma and the server both resolve it explicitly, since workspace/turbo commands run with a cwd inside the package, not the repo root).

`OPENROUTER_API_KEY` is reserved for Phase 1 (chat) and unused by any code right now.

## Notes

- Prisma is configured with **zero models** for now — Phase 0 only proves the migration pipeline works; the first real models (`Task`, then `Conversation`/`Message`) arrive in later phases.
- The Prisma client is generated into `apps/api/src/generated/prisma` (gitignored) — run `npm run db:generate` after cloning or whenever `prisma/schema.prisma` changes.
