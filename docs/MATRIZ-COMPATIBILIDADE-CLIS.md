# Matriz de Compatibilidade de CLIs

## Escopo
Providers suportados:
- gemini
- claude
- copilot
- codex (opcional)

Task types:
- summarization
- enrichment
- reranking
- proactive-planning
- long-analysis
- code-automation

## Matriz (resumo)

| Provider | summarization | enrichment | reranking | proactive-planning | long-analysis | code-automation |
|---|---|---|---|---|---|---|
| gemini | high | high | high | high | medium | medium |
| claude | medium | medium | medium | medium | high | medium |
| copilot | medium | medium | low | medium | medium | high |
| codex | low | low | low | low | low | medium |

Fonte: src/core/llm-cli/ProviderCapabilityMatrix.ts

## Defaults por tipo de tarefa
Fonte: src/core/llm-cli/PromptCatalog.ts

- summarization -> gemini
- enrichment -> gemini
- reranking -> gemini
- proactive-planning -> gemini
- long-analysis -> claude
- code-automation -> copilot

## Roteamento efetivo
Resolver: src/core/llm-cli/ProviderRoutingStrategy.ts

Ordem de decisao:
1. preferredProvider explicitamente enviado no request
2. taskOverrides configurado por workspace
3. abTests configurado por workspace (deterministico)
4. defaultProvider configurado
5. default do PromptCatalog

Fallback:
- respeita fallbackOrder configurado ou default interno
- remove provider preferencial da lista
- filtra providers nao suportados para o taskType
- deduplica entradas

## Configuracao de override
Persistida em settings (ai.provider.*):
- routing.defaultProvider
- routing.fallbackOrder
- routing.taskOverrides
- routing.abTests

Parser/config loader: app/api/_lib/llm-cli-routing.ts

## A/B Test
Formato esperado em routing.abTests:
```
{
  "summarization": {
    "providers": ["gemini", "claude"],
    "ratio": 0.5,
    "seed": "exp-2026-04"
  }
}
```

Atribuicao:
- deterministica por taskType + seed + contextKey
- ratio define fracao para providers[0]

## Endpoint de introspeccao
GET /api/v1/inference/capabilities

Retorna:
- matrix
- promptProfiles
- routingConfig
- resolvedDefaults por taskType
