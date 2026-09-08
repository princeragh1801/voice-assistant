# Jarvis — Architecture & Roadmap

This document describes where Jarvis is today and how it is planned to evolve. Phases 0-4 below are **implemented and live-verified**. Everything from Phase 5 onward is **forward-looking documentation only** — not implemented yet. It exists so that later phases have a coherent target to build toward instead of accumulating ad-hoc decisions.

## Current State (through Phase 4 — Conversations & Memory)

A Turborepo monorepo with npm workspaces:

```
apps/
  web/      React + Vite + TypeScript — chat UI (text + voice) over a persistent conversation
  api/      Express + TypeScript — health, chat (LLM + tool-calling), tasks, conversation history
packages/
  types/    Shared TypeScript types (wire contracts between web and api)
  shared/   Shared runtime constants (e.g. API_ROUTES)
  config/   Shared ESLint (flat config) and TypeScript base configs
```

Postgres (via Docker Compose) + Prisma model three domains: `Task` (Phase 3), and `Conversation`/`Message` (Phase 4). `apps/api/src/modules/` holds `llm/` (the `LLMService` abstraction over OpenRouter, including tool-calling support), `tasks/` (task CRUD + the tools exposed to the LLM), and `conversations/` (the single ongoing conversation's history, windowed for both LLM context and page-load hydration).

The web UI (`apps/web/src/components/Chat.tsx`) supports typed and voice (Web Speech API) input, auto-speaks replies to voice-initiated messages, and reloads conversation history from the backend on page load — refreshing the browser no longer loses the conversation. No calendar, no agent orchestration, and no coding agent exist yet.

## Planned Evolution

### Phase 1 — Basic Chat ✅
An `LLMService` abstraction in `apps/api/src/modules/llm/` talks to OpenRouter, so the rest of the app never calls a provider SDK directly:

```
Frontend chat UI → Express API → LLMService → OpenRouter → Response
```
Swapping OpenRouter for OpenAI, Anthropic, or a local model later means writing a new implementation of `LLMService`, not rewriting call sites.

### Phase 2 — Voice ✅
Speech-to-text and text-to-speech via the browser's native Web Speech API, plus a microphone button in the UI:

```
Microphone → Speech-to-Text → Backend → LLM → Text response → Text-to-Speech → User
```
No wake-word detection — push-to-talk only. Auto-speaks a reply only when the triggering message was itself spoken; typed messages get a manual replay button instead.

### Phase 3 — Task Management ✅
Tasks persist in Postgres (`Task` model: id, title, description, status, priority, dueDate, createdAt, updatedAt; statuses TODO/IN_PROGRESS/COMPLETED/CANCELLED; priorities LOW/MEDIUM/HIGH). The LLM never touches the database directly — it selects from a fixed set of backend-validated tools:

```
get_tasks · get_today_tasks · create_task · update_task · complete_task
```
The LLM decides *which* tool to call (looking up a task's id via `get_tasks` before acting on one it only knows by name); the backend validates arguments, executes the tool, and turns the structured result back into natural language. No `delete_task` tool is exposed to the LLM — deleting via an unconfirmed voice command is exactly the kind of action the "Human Approval" principle below would gate; the REST `DELETE` endpoint exists for direct API use only.

### Phase 4 — Conversations & Memory ✅
A single ongoing `Conversation` persists its `Message`s in Postgres — no multi-conversation list/switcher, matching how a personal assistant is actually used. The backend is the source of truth: `POST /api/chat` takes just the newest message, loads recent history from Postgres itself, and `GET /api/conversation` lets the frontend reload that history on page load. Full history is never deleted, but only a recent sliding window (last 20 messages) is sent to the LLM on each call — bounding cost/latency as a conversation grows over weeks without needing real summarization yet. Only clean user/assistant turns are stored; tool-calling bookkeeping from Phase 3's loop never is.

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

**Database grows only when a phase needs it.** So far: `Task` (Phase 3), `Conversation`/`Message` (Phase 4). Later: `Meeting`/`Integration` (Phase 5) → `Agent`/`AgentRun`/`ToolCall`/`Approval` (Phase 6+).
