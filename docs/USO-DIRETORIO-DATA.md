# Mapeamento do Diretório `data/`

> Documento gerado a partir de varredura completa do workspace Vigil.
> Lista **tudo** que lê ou escreve em `data/`, **como** acessa e **para que serve**.

## Visão Geral

O diretório `data/` na raiz do repositório centraliza toda a persistência da aplicação. A estrutura é organizada por **domínio** e, dentro de cada domínio, geralmente por **data ISO (YYYY-MM-DD)**. Logs append-only usam **JSON Lines**; snapshots e configurações usam **JSON** ou **Markdown**.

### Configuração global

- Variável de ambiente: `VIGIL_DATA_DIR` (default: `data` relativo a `process.cwd()`).
- Definida em [src/config/settings.ts](src/config/settings.ts#L21).
- Padrão usado em todo o código: `path.resolve(process.cwd(), 'data')`.

### Fluxo de dados (pipeline)

```
Observers (file/terminal/API)
        │
        ▼
MemoryManager.log()  ──►  data/logs/{date}.log
        │
        ▼
EventEnrichmentService  ──►  data/logs/enriched/{date}.enriched.log
        │
        ▼
ProactivePlannerService  ──►  data/proactive/{date}/{projectId}-{ts}.json
        │
        ▼
SelfOptimizationService  ──►  data/self-optimization/{date}/...json
        │
        ▼
Sleep cycle (Summarizer/Consolidator/SleepInference)
        ──►  data/summaries/daily/{date}.{md,json}
        ──►  data/summaries/facts/current-facts.json
```

Em paralelo: `data/audit/llm-cli/` recebe auditoria de **toda** chamada a CLIs LLM, e `data/index/` mantém vetores/metadados para busca semântica.

---

## Mapa por subdiretório

### 1. `data/proactive/`

**Domínio:** Planejamento proativo (riscos, oportunidades, candidatos a tarefa).

**Produtor:**
- [src/core/services/ProactivePlannerService.ts](src/core/services/ProactivePlannerService.ts#L102) — roda periodicamente (default 5 min), carrega eventos enriquecidos recentes, executa prompt via `CliInferenceService`, persiste em `persistRun()`.

**Consumidores:**
- [app/api/v1/decisions/feed/route.ts](app/api/v1/decisions/feed/route.ts#L410)
- [app/api/v1/decisions/data/route.ts](app/api/v1/decisions/data/route.ts#L410)
- [app/api/v1/proactive/insights/route.ts](app/api/v1/proactive/insights/route.ts)

**Layout:**
```
data/proactive/2026-04-27/system-2026-04-27T19-22-44-903Z.json
```

**Schema (resumido):**
```json
{
  "projectId": "system",
  "generatedAt": "ISO8601",
  "provider": "copilot|claude|gemini",
  "command": "string",
  "exitCode": 0,
  "inputEvents": 42,
  "plan": {
    "risks": [{"title","severity","evidence","recommendedAction"}],
    "opportunities": [{"title","impact","evidence","suggestedAction"}],
    "taskCandidates": [{"title","priority","sensitivity","requiresApproval"}],
    "recommendations": [{"title","rationale","action"}]
  },
  "pendingApprovals": [{"requestId","taskTitle","reason","status"}]
}
```

**Path:** `path.join(process.cwd(), 'data', 'proactive')` em [ProactivePlannerService.ts](src/core/services/ProactivePlannerService.ts#L94).

---

### 2. `data/self-optimization/`

**Domínio:** Loop de auto-otimização (sugestões de configuração, política e roteamento).

**Produtor:**
- [src/core/services/SelfOptimizationService.ts](src/core/services/SelfOptimizationService.ts#L90) — roda periodicamente (default 10 min), coleta métricas/benchmarks, escreve snapshot e anexa decisões.

**Consumidores:**
- [app/api/v1/self-optimization/route.ts](app/api/v1/self-optimization/route.ts)
- [app/api/v1/decisions/feed/route.ts](app/api/v1/decisions/feed/route.ts#L214) (`parseSelfOptimizationFiles()`)

**Layout:**
```
data/self-optimization/2026-04-27/
  ├── self-optimization-2026-04-27T19-22-10-942Z.json
  └── decisions.log   # JSON Lines (append-only)
```

**Schema do snapshot:**
```json
{
  "generatedAt":"ISO8601",
  "provider":"copilot|claude|gemini",
  "metricsSnapshot":{...},
  "benchmarkReport":{...},
  "plan":{
    "configImprovements":[{"settingKey","proposedValue","expectedImpact"}],
    "policyChanges":[{"policyArea","change","riskLevel"}],
    "routingChanges":[{"taskType","recommendedProvider","confidence"}]
  },
  "suggestions":[{"id","category","title","status","createdAt"}]
}
```

**`decisions.log` (uma linha por decisão):**
```json
{"suggestionId":"...","decision":"accepted|rejected","actor":"user","timestamp":"ISO8601"}
```

**Path:** `path.join(process.cwd(), 'data', 'self-optimization')` em [SelfOptimizationService.ts](src/core/services/SelfOptimizationService.ts#L91).

---

### 3. `data/audit/llm-cli/`

**Domínio:** Trilha de auditoria de **todas** as chamadas a CLIs LLM (Copilot, Claude, Gemini, Codex).

**Produtor:**
- [src/core/llm-cli/CliAuditTrail.ts](src/core/llm-cli/CliAuditTrail.ts#L32) — `append(record)` chamado pelo `CliInferenceService` após cada execução.

**Consumidores:**
- [app/api/v1/decisions/feed/route.ts](app/api/v1/decisions/feed/route.ts#L449)
- Painéis/relatórios de auditoria.

**Layout:**
```
data/audit/llm-cli/2026-04-27/inference.log   # JSON Lines
```

**Schema (`CliAuditRecord`):**
```json
{
  "id":"timestamp-random",
  "timestamp":"ISO8601",
  "provider":"gemini|claude|copilot|codex",
  "command":"string",
  "args":["..."],
  "durationMs":1234,
  "exitCode":0,
  "success":true,
  "timedOut":false,
  "retriesUsed":0,
  "promptClass":"operational|sensitive",
  "prompt":"... (condicional)",
  "stdout":"... (condicional)",
  "stderr":"... (condicional)",
  "metadata":{...},
  "error":"..."
}
```

**Path:** default `path.join(process.cwd(), 'data', 'audit', 'llm-cli')`; configurável via `options.dataDir` em [CliAuditTrail.ts](src/core/llm-cli/CliAuditTrail.ts#L32).

---

### 4. `data/skills/`

**Domínio:** Catálogo externo de skills/prompts por fornecedor (ANTHROPIC, BOLT, BRAVE, CLINE, CURSOR, OPENAI, PERPLEXITY, REPLIT, WINDSURF, etc.).

**Produtor:** Nenhum em runtime — populado manualmente/via scripts.

**Consumidores:**
- [src/core/agents/externalSkillCatalog.ts](src/core/agents/externalSkillCatalog.ts#L13) — `loadExternalSkillsFromData(force?)` faz leitura recursiva com cache de 5 min.
- [src/core/services/AgentService.ts](src/core/services/AgentService.ts#L235) — gera agentes prebuilt a partir das skills.
- UI do dashboard (seleção de skill).

**Layout:**
```
data/skills/
  ├── ANTHROPIC/<arquivo>.md
  ├── OPENAI/<subpasta>/<arquivo>.md
  └── ...
```

Arquivos `.md`/texto puro, onde o conteúdo é o prompt e o nome do arquivo vira o slug da skill.

**Tipo em memória:**
```ts
interface ExternalSkillDefinition {
  provider: string;   // ANTHROPIC, OPENAI, ...
  filePath: string;
  key: string;        // `${providerSlug}-${fileSlug}`
  title: string;
  description: string;
  prompt: string;     // conteúdo do arquivo
}
```

**Path:** `path.join(process.cwd(), 'data', 'skills')` em [externalSkillCatalog.ts](src/core/agents/externalSkillCatalog.ts#L13).

---

### 5. `data/logs/` e `data/logs/enriched/`

**Domínio:** Log bruto de eventos (append-only) e versão enriquecida com classificação/tags/relevância.

**Produtores:**
- [src/memory/memoryManager.ts](src/memory/memoryManager.ts#L76) — `MemoryManager.log()` grava `{date}.log`.
- [src/core/services/EventEnrichmentService.ts](src/core/services/EventEnrichmentService.ts#L62) — escreve `enriched/{date}.enriched.log`.

**Consumidores:**
- `MemoryManager.readLog()` em [memoryManager.ts](src/memory/memoryManager.ts#L86).
- [ProactivePlannerService.loadRecentEnrichedEvents()](src/core/services/ProactivePlannerService.ts#L174).
- [EventEnrichmentService](src/core/services/EventEnrichmentService.ts#L30) (lê o bruto para enriquecer).
- Rotas de inspeção/auditoria.

**Layout:**
```
data/logs/2026-04-27.log              # JSON Lines (MemoryEntry)
data/logs/enriched/2026-04-27.enriched.log  # JSON Lines (EnrichedMemoryEntry)
```

**`MemoryEntry`:**
```json
{"id":"uuid","content":"string","source":"code-observer|terminal|api|...","projectId":"...","timestamp":"ISO8601"}
```

**`EnrichedMemoryEntry`:**
```json
{
  "raw":{...MemoryEntry},
  "enriched":{"classification":"...","tags":["..."],"relevance":0.7,"entities":["..."],"suggestedAction":"..."},
  "inference":{"provider":"gemini","command":"...","rawText":"...","exitCode":0},
  "enrichedAt":"ISO8601"
}
```

**Constantes** em [memoryManager.ts](src/memory/memoryManager.ts#L7):
- `DATA_DIR = path.resolve(process.cwd(), 'data')`
- `LOGS_DIR = path.join(DATA_DIR, 'logs')`
- `ENRICHED_LOGS_DIR = path.join(LOGS_DIR, 'enriched')`

---

### 6. `data/summaries/`

**Domínio:** Resumos diários consolidados e base permanente de fatos extraídos.

**Produtores:**
- [src/sleep/summarizer.ts](src/sleep/summarizer.ts#L50) — gera `daily/{date}.md` (legível).
- [src/sleep/consolidator.ts](src/sleep/consolidator.ts#L56) — gera `daily/{date}.json` (estatísticas agregadas).
- [src/sleep/SleepInferenceService.ts](src/sleep/SleepInferenceService.ts#L12) — atualiza `facts/current-facts.json` e arquivos de contradições.

**Consumidores:**
- [SleepInferenceService](src/sleep/SleepInferenceService.ts) — lê e atualiza fatos.
- [src/sleep/pruning.ts](src/sleep/pruning.ts#L41) — remove resumos expirados.
- [app/api/v1/summaries/semantic/route.ts](app/api/v1/summaries/semantic/route.ts).

**Layout:**
```
data/summaries/
  ├── daily/2026-04-27.md
  ├── daily/2026-04-27.json
  └── facts/
      ├── current-facts.json
      └── contradictions-2026-04-27.json
```

**JSON diário:**
```json
{"date":"2026-04-27","totalEntries":15,"bySource":{"code-observer":10,"terminal":5},"byProject":{"system":15},"consolidatedAt":"ISO8601"}
```

**`current-facts.json`:**
```json
[{"fact":"string","score":0.0,"rationale":"string"}]
```

**Constantes** em [SleepInferenceService.ts](src/sleep/SleepInferenceService.ts#L10):
- `DAILY_DIR = path.join(DATA_DIR, 'summaries', 'daily')`
- `FACTS_DIR = path.join(DATA_DIR, 'summaries', 'facts')`

**Retenção:** 90 dias (default) em [pruning.ts](src/sleep/pruning.ts).

---

### 7. `data/index/`

**Domínio:** Índice vetorial e metadados para busca semântica.

**Produtores/Consumidores:**
- [src/memory/index/vectorStore.ts](src/memory/index/vectorStore.ts) — embeddings.
- `src/memory/index/metadataStore.ts` — metadados.
- Inicialização do `MemoryManager` cria os subdiretórios.

**Layout:**
```
data/index/
  ├── vectors/
  └── metadata/
```

**Constante:** `INDEX_DIR = path.join(DATA_DIR, 'index')` em [memoryManager.ts](src/memory/memoryManager.ts#L10).

---

### 8. `data/conversations/` (criado em runtime)

**Domínio:** Histórico persistente de conversas do chat.

**Produtor:**
- [src/memory/conversations/ConversationStore.ts](src/memory/conversations/ConversationStore.ts#L32) — append/update.

**Consumidores:**
- [src/interfaces/dashboard/views/ConversationsSidebarProvider.ts](src/interfaces/dashboard/views/ConversationsSidebarProvider.ts#L24).
- UI de chat para carregar histórico.

**Layout:**
```
data/conversations/
  ├── conversations.json          # metadados
  └── {conversationId}.json       # mensagens
```

**Path:** `path.join(process.cwd(), 'data', 'conversations')`.

---

### 9. `data/tasks.json` (arquivo)

**Domínio:** Armazenamento simples de tarefas.

**Produtor/Consumidor:** `TaskStore` em `src/core/tasks/`, consumido por [ConversationsSidebarProvider.ts](src/interfaces/dashboard/views/ConversationsSidebarProvider.ts#L24) e dashboard.

**Path:** `path.join(process.cwd(), 'data', 'tasks.json')`.

---

### 10. `data/mcp-servers.json` (arquivo)

**Domínio:** Configurações de servidores MCP (Model Context Protocol).

**Produtor/Consumidor:**
- [src/core/mcp-client/McpClientManager.ts](src/core/mcp-client/McpClientManager.ts#L23) — leitura/escrita.
- `McpSettingsPanel` (UI).

**Schema:**
```json
[{"id":"...","name":"...","serverUrl":"...","enabled":true,"oauthClientId":"...","oauthClientSecret":"..."}]
```

**Path:** `path.join(process.cwd(), 'data', 'mcp-servers.json')`.

---

## Resumo em tabela

| Subcaminho | Domínio | Produtor | Consumidor principal | Formato |
|---|---|---|---|---|
| `proactive/` | Planejamento proativo | `ProactivePlannerService` | `/api/v1/proactive/insights`, decisions feed | JSON por execução |
| `self-optimization/` | Auto-otimização | `SelfOptimizationService` | `/api/v1/self-optimization`, decisions feed | JSON + `decisions.log` (JSONL) |
| `audit/llm-cli/` | Auditoria LLM | `CliAuditTrail` | decisions feed, análises | `inference.log` (JSONL) |
| `skills/` | Skills externas | manual | `ExternalSkillCatalog`, `AgentService` | Markdown por skill |
| `logs/` | Eventos brutos | `MemoryManager.log` | `EventEnrichmentService`, planner | `{date}.log` (JSONL) |
| `logs/enriched/` | Eventos enriquecidos | `EventEnrichmentService` | planner, queries de memória | `{date}.enriched.log` (JSONL) |
| `summaries/daily/` | Resumos diários | `Summarizer`, `Consolidator` | `/api/v1/summaries/semantic`, pruning | `.md` + `.json` |
| `summaries/facts/` | Fatos permanentes | `SleepInferenceService` | ciclo de sleep | `current-facts.json` |
| `index/` | Vetores/metadados | `VectorStore`, `MetadataStore` | busca semântica | binários/JSON |
| `conversations/` | Chat | `ConversationStore` | dashboard, chat UI | JSON por conversa |
| `tasks.json` | Tarefas | `TaskStore` | dashboard | JSON único |
| `mcp-servers.json` | Config MCP | `McpClientManager` | conexões MCP, UI | JSON único |

---

## API Routes que expõem `data/`

- [GET/POST `/api/v1/decisions/feed`](app/api/v1/decisions/feed/route.ts) — visão unificada (proactive + self-optimization + audit).
- [GET/POST `/api/v1/decisions/data`](app/api/v1/decisions/data/route.ts) — alternativa.
- [GET/POST `/api/v1/proactive/insights`](app/api/v1/proactive/insights/route.ts).
- [GET/POST `/api/v1/self-optimization`](app/api/v1/self-optimization/route.ts).
- [GET `/api/v1/summaries/semantic`](app/api/v1/summaries/semantic/route.ts).

---

## Padrões e convenções

- **Datas em pasta:** `YYYY-MM-DD/` para particionar arquivos diários.
- **Timestamp em nome de arquivo:** ISO 8601 com `:` substituído por `-` (ex.: `2026-04-27T19-22-10-942Z`).
- **JSON Lines (`.log`):** usado em todos os arquivos append-only.
- **Snapshots (`.json`):** usados para resultados completos por execução.
- **Markdown (`.md`):** usado em resumos legíveis e nas skills externas.
- **Plain text, sem compressão:** retenção é controlada por pruning.

## Inicialização e retenção

Inicialização (em `app/api/_lib/db.ts` ao subir a app):
1. `MemoryManager.init()` cria diretórios de logs/índice/sumários.
2. `ObserverService.initialize()` ativa observers.
3. `ProactivePlannerService.start()` inicia ciclo proativo.
4. `SelfOptimizationService.start()` inicia ciclo de otimização.
5. Políticas de retenção aplicadas via [pruning.ts](src/sleep/pruning.ts).

Retenção padrão:
- Logs: **30 dias**
- Resumos: **90 dias**

---

## Observações

1. Hierarquia clara: **observação bruta → enriquecimento → agregação → análise autônoma**.
2. Auditoria em `data/audit/llm-cli/` é **append-only e imutável**.
3. Decisões de aprovação/rejeição são gravadas em arquivos próprios (`decisions.log`) — não sobrescrevem snapshots.
4. `data/skills/` é **read-only** com cache de 5 min.
5. Toda a localização do diretório `data/` pode ser sobrescrita via env `VIGIL_DATA_DIR`.
