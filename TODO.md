# TODO — VIGIL

## Now

- [ ] MCP server: expose observers as resources (status, last event, throughput).
- [ ] MCP server: expose settings as resources, mutations gated by approval flow.
- [ ] MCP server: expose policy audit trail per orchestrator run.
- [ ] HTTP API: mirror the MCP surface for non-MCP clients (`GET /api/v1/observers`,
      `PATCH /api/v1/observers/:id`, `GET /api/v1/settings`, `PATCH /api/v1/settings`,
      `GET /api/v1/orchestrator/runs/:runId/audit`).
- [ ] Drop dead imports left by the dashboard removal — typecheck must pass clean.

## Next

- [ ] Provider matrix: keep OpenAI / Anthropic / Gemini parity, formalize the
      Ollama-compatible local provider and document required envs.
- [ ] Sleep cycle: backpressure when log volume spikes; configurable retention.
- [ ] Reference `Dockerfile` and `Dockerfile.cli` images that build off the trimmed tree.
- [ ] CI matrix: Node 20 + 22 on ubuntu-latest, run `build` + `test:unit`.
- [ ] Observer SDK: documented contract for plugging external observers without
      forking core.

## Later

- [ ] Distributed memory backends (S3, Postgres, Qdrant) as opt-in adapters.
- [ ] Multi-tenant separation (per-namespace memory + policies).
- [ ] Live policy reload (currently requires restart).
- [ ] Pluggable embedding providers beyond the bundled defaults.

## Done

- [x] `chatWithTools(conversationId, message, onEvent)` — `src/core/chat/chatWithTools.ts`
- [x] Register `read_pdf` as a tool in the agent loop — `src/core/chat/toolRegistry.ts`
- [x] Inject skills into `systemPrompt` before each turn — via `buildSkillsPrompt()`
- [x] Inject MCP tools into `tools[]` before each turn — via `mcpManager.getAllTools()`
