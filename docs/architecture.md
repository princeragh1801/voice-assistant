# Jarvis — Architecture & Roadmap

This document describes where Jarvis is today and how it is planned to evolve. Everything below "Current State (Phase 0)" is **forward-looking documentation only** — none of it is implemented yet. It exists so that later phases have a coherent target to build toward instead of accumulating ad-hoc decisions.

## Current State (Phase 0 — Foundation)

A Turborepo monorepo with npm workspaces:

```
apps/
  web/      React + Vite + TypeScript — fetches GET /api/health and renders the result
  api/      Express + TypeScript — a single health endpoint, Prisma wired to Postgres
packages/
  types/    Shared TypeScript types (e.g. HealthCheckResponse)
  shared/   Shared runtime constants (e.g. API_ROUTES)
  config/   Shared ESLint (flat config) and TypeScript base configs
```

Postgres runs via Docker Compose. Prisma is configured with **zero models** — Phase 0's job is to prove the full pipeline (schema → migration → generated client → connected query) works, not to model any domain data yet. `apps/api/src/` currently only has `config/`, `routes/`, `app.ts`, and `server.ts` — no business logic exists yet.

No voice, no chat, no LLM calls, no task management, and no agents exist yet. `OPENROUTER_API_KEY` is present in `.env.example` but unused by any code.

## Planned Evolution

### Phase 1 — Basic Chat
Introduce an `LLMService` abstraction in `apps/api/src/modules/llm/` that talks to OpenRouter, so the rest of the app never calls a provider SDK directly:

```
Frontend chat UI → Express API → LLMService → OpenRouter → Response
```
Swapping OpenRouter for OpenAI, Anthropic, or a local model later should mean writing a new implementation of `LLMService`, not rewriting call sites.

### Phase 2 — Voice
Add speech-to-text and text-to-speech plus a microphone button in the UI:

```
Microphone → Speech-to-Text → Backend → LLM → Text response → Text-to-Speech → User
```
No wake-word detection yet — that's a later refinement once push-to-talk works reliably.

### Phase 3 — Task Management
Persist tasks in Postgres (`Task` model: id, title, description, status, priority, dueDate, createdAt, updatedAt; statuses TODO/IN_PROGRESS/COMPLETED/CANCELLED). The LLM never touches the database directly — it selects from a fixed set of backend-validated tools:

```
getTasks · createTask · updateTask · completeTask · getTodayTasks
```
The LLM decides *which* tool to call; the backend executes it and turns the structured result back into natural language.

### Phase 4 — Conversations & Memory
Persist `Conversation` and `Message` so Jarvis has continuity across interactions, without storing every utterance forever — retention/summarization strategy to be decided when this phase starts.

### Phase 5 — Calendar
Integrate a calendar provider so questions like "what meetings do I have today?" and "how busy am I?" work.

### Phase 6 — Agent Orchestrator
Introduce a pluggable agent registry:

```
interface Agent {
  id: string
  name: string
  description: string
  capabilities: string[]
  execute(input): Promise<AgentResult>
}
```
The voice assistant becomes the orchestrator that routes a request to the right agent:

```
                    ┌───────────────┐
                    │   React UI    │
                    │ Voice / Chat  │
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │    Jarvis     │
                    │ Orchestrator  │
                    └───────┬───────┘
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
        Task Tools     Calendar Tool   Agent System
                                             │
                         ┌───────────────────┼──────────────┐
                         ▼                   ▼              ▼
                    Coding Agent       Research Agent   Testing Agent
```

### Phase 7 — Coding Agent
A specialized agent that can analyze a repository and propose changes:

```
Voice → Jarvis → Planner → Coding Agent → Repository → Analysis → Approval → Changes
```
Read operations (analyze, inspect, search) run freely. Write/action operations (modify files, commit, push, open a PR) require explicit user confirmation first — see "Human Approval" below.

### Phase 8 — Multi-Agent Workflows
Parallel agent execution with dependencies, live status, retries, and result aggregation, so a request like "analyze this issue" can fan out into concurrent sub-tasks (e.g. backend analysis, frontend analysis, git history analysis) and the user can ask "what are the agents doing?" at any time.

## Cross-Cutting Principles

**LLM as orchestrator, not database.** The LLM decides *which* structured tool/function to call; the backend validates arguments and performs the actual operation. The LLM never generates or executes raw SQL or shell commands.

**Read vs. Action operations.** Reads (analyze code, check tasks, check meetings, search docs) execute freely. Actions (modify files, commit, push, create a PR, delete something, send a message, change task status in a way that isn't the direct target of the user's request) should prompt for confirmation before executing, especially once agents can take real-world effects.

**Agents are pluggable**, registered against a common interface — the system is never hard-coded around a single agent.

**Real-time updates via Socket.IO only where they add real value** — agent status, task status, agent logs, voice assistant state. Not sprinkled into every feature.

**Database grows only when a phase needs it.** Today: none. Later, roughly in this order: `Task` (Phase 3) → `Conversation`/`Message` (Phase 4) → `Meeting`/`Integration` (Phase 5) → `Agent`/`AgentRun`/`ToolCall`/`Approval` (Phase 6+).
