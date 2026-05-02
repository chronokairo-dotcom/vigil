# VIGIL

> Persistent, observation-first cognitive agent. MCP-native, headless.

VIGIL is a background cognitive layer for AI agents: it observes, remembers,
recalls, and acts over time. It is **not** a chat UI, **not** a desktop app,
**not** an IDE extension, and **not** a coding agent. It is the part most
agent stacks skip — the persistent, observational core — exposed through a
CLI and an MCP server so any client (Claude Code, Cursor, opencode, your own
script) can plug in.

## What it is

- **Persistent memory** — append-only logs, vector + metadata indexes, daily
  summaries that survive restarts.
- **Continuous observation** — file watchers, event bus, pluggable observers
  feeding the memory layer.
- **Sleep-cycle consolidation** — periodic background pass that summarizes,
  compresses and prunes the raw logs into long-term knowledge.
- **MCP-native** — first-class Model Context Protocol server, so agents
  consume VIGIL as just another tool/resource provider.
- **Bring your own LLM** — OpenAI, Anthropic, Gemini, or local via Ollama.
- **Headless** — CLI + HTTP/MCP server. No bundled UI.

## What it is NOT

- Not a desktop application (no Tauri, no Electron).
- Not a VS Code / Cursor / IDE extension. Use Claude Code, opencode, Cursor,
  Copilot, etc., and have them talk to VIGIL via MCP.
- Not a coding agent. Use opencode, Claude Code, Codex, Gemini CLI, etc.

## Why fork from kairos

[kairos](https://github.com/chronokairo/kairos) shipped multiple UI surfaces
(Tauri desktop shell, Next.js dashboard, VS Code extension, embedded mini SWE
agent) on top of a strong cognitive core. In 2026 most of that surface area is
better served by the broader ecosystem (MCP for tool integration, ACP harnesses
like opencode / Claude Code / Codex for coding, IDE-native agents for editor
UX). VIGIL keeps the core — memory, observation, recall, sleep cycle, policies,
skills, MCP — and drops everything else.

## Quickstart

### Requirements

- Node.js 20+
- pnpm 9+ (or npm)

### Install

```bash
pnpm install
pnpm build
```

### Configure

Copy `.env.example` to `.env` and fill in at least one LLM provider key.

### Run

```bash
# CLI
node dist/interfaces/cli/index.js --help

# MCP server (stdio)
node dist/interfaces/api/index.js

# HTTP API
node dist/interfaces/api/start-api.js
```

After install, the binaries `vigil`, `vigil-mcp` and `vigil-api` are also
available from `node_modules/.bin/` and (if linked globally) on `PATH`.

### Tests

```bash
pnpm test:unit
```

## Architecture

```
                ┌────────────────────┐
                │   Observation Layer│
                └────────┬───────────┘
                         │
                         ▼
                ┌────────────────────┐
                │  Append-Only Logs  │
                └────────┬───────────┘
                         │
                         ▼
                ┌────────────────────┐
                │ Memory Indexing    │
                └────────┬───────────┘
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
┌────────────────────┐       ┌────────────────────┐
│ Recall Engine      │       │ Sleep Cycle Engine │
└────────┬───────────┘       └────────┬───────────┘
         │                            │
         ▼                            ▼
   ┌────────────────────────────────────────┐
   │   Decision & Action Layer + Policies   │
   └────────────────────────────────────────┘
                         │
                         ▼
   ┌────────────────────────────────────────┐
   │           CLI · HTTP · MCP             │
   └────────────────────────────────────────┘
```

## Project structure

```
vigil/
├── src/
│   ├── core/               # Agent loop, services, tools, MCP client, skills, providers
│   ├── memory/             # Vector store, metadata store, summaries
│   ├── observation/        # Event bus, file watchers, observers
│   ├── recall/             # Retriever, ranking, context builder
│   ├── sleep/              # Consolidator, summarizer, pruning
│   ├── actions/            # Action engine primitives
│   ├── policies/           # Permissions, guardrails, approval flow
│   ├── config/             # Settings, feature flags
│   ├── interfaces/
│   │   ├── cli/            # Commander-based CLI
│   │   ├── api/            # HTTP + MCP server
│   │   └── llm-server/     # Local LLM proxy server
│   ├── lib/                # Shared utilities
│   └── utils/              # Logger, time, embeddings
├── data/                   # Runtime persistence
│   ├── logs/               # Append-only observation logs
│   ├── index/              # Vector and metadata indexes
│   └── summaries/          # Daily sleep-cycle summaries
├── docs/
├── scripts/
└── package.json
```

## Configuration

VIGIL reads configuration from environment variables (prefix `VIGIL_*`).
See `.env.example` for the full list. Highlights:

| Var | Purpose |
| --- | --- |
| `VIGIL_FEATURE_LLM` | Master switch for any LLM usage (`1` enabled, `0` disabled). |
| `VIGIL_LLM_DISABLED` | Hard-disable LLM calls regardless of provider keys. |
| `VIGIL_DATA_DIR` | Root directory for runtime persistence (default `./data`). |
| `VIGIL_API_HOST` / `VIGIL_API_PORT` | HTTP/MCP server bind. |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | Cloud LLM providers. |
| `OLLAMA_BASE_URL` | Local LLM via Ollama-compatible endpoint. |

## Safety

Continuous observation + autonomous action is dangerous by default. VIGIL ships
with:

- Feature flags (`src/config/featureFlags.ts`) that gate sensitive subsystems.
- Scoped observer boundaries — observers only see what you explicitly hand them.
- Action approval flow (`src/policies/approvalFlow.ts`) for any non-readonly
  action.
- Full audit logs of every decision and action.

Treat `VIGIL_LLM_DISABLED=1` as the safe default while you wire it up.

## Roadmap

See [TODO.md](./TODO.md). Short version:

- **Now** — finish MCP surface (observers, settings, policy audits as resources).
- **Next** — broaden provider matrix, harden sleep-cycle backpressure, ship a
  reference Docker image.
- **Later** — pluggable observer SDK, distributed memory backends.

## License

MIT — see [LICENSE](./LICENSE). Copyright (c) 2026 VIGIL Contributors.
