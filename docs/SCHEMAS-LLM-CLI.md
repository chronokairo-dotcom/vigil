# Schemas LLM-CLI

## Visao Geral
Este documento centraliza os contratos estruturados usados nas inferencias por CLI.
Todos os parsers fazem validacao explicita e possuem fallback quando o output nao e valido.

## 1) Event Enrichment
Arquivo: src/core/services/EventEnrichmentService.ts

### Entrada de prompt (resumo)
- Lista de eventos com: id, source, projectId, content, timestamp.

### Saida esperada (JSON array)
```
[
  {
    "id": "string",
    "classification": "string",
    "tags": ["string"],
    "relevance": 0.0,
    "entities": ["string"],
    "suggestedAction": "string"
  }
]
```

### Regras
- relevance entre 0 e 1.
- tags/entities com limite de tamanho.
- fallback local quando parse/schema falha.

## 2) Sleep Cycle Summary
Arquivo: src/sleep/SleepInferenceService.ts

### Saida esperada (JSON object)
```
{
  "narrativeSummary": "string",
  "keyChanges": ["string"],
  "permanentFacts": [
    {
      "fact": "string",
      "score": 0.0,
      "rationale": "string"
    }
  ],
  "contradictions": [
    {
      "existingFact": "string",
      "newFact": "string",
      "reason": "string",
      "severity": "low|medium|high"
    }
  ],
  "pruningSuggestions": [
    {
      "target": "string",
      "reason": "string",
      "score": 0.0
    }
  ]
}
```

### Regras
- score entre 0 e 1.
- guardrail de promocao por minFactScore.
- overwrite sensivel exige approval.

## 3) Proactive Planner
Arquivo: src/core/services/ProactivePlannerService.ts

### Saida esperada (JSON object)
```
{
  "risks": [
    {
      "title": "string",
      "severity": "low|medium|high|critical",
      "evidence": "string",
      "recommendedAction": "string"
    }
  ],
  "opportunities": [
    {
      "title": "string",
      "impact": "low|medium|high",
      "evidence": "string",
      "suggestedAction": "string"
    }
  ],
  "taskCandidates": [
    {
      "title": "string",
      "description": "string",
      "priority": "low|medium|high",
      "rationale": "string",
      "sensitivity": "low|medium|high",
      "requiresApproval": false
    }
  ],
  "recommendations": [
    {
      "title": "string",
      "rationale": "string",
      "action": "string"
    }
  ]
}
```

### Regras
- tarefas sensiveis podem entrar no ApprovalFlow.
- fallback gera recomendacao de revisao manual.

## 4) Benchmark Interpretation
Arquivo: src/core/services/BenchmarkInterpretationService.ts

### Saida esperada (JSON object)
```
{
  "modelExplanations": [
    {
      "modelId": "string",
      "strengths": ["string"],
      "weaknesses": ["string"],
      "bestUseCases": ["string"]
    }
  ],
  "routingPolicy": [
    {
      "taskType": "summarization|enrichment|reranking|proactive-planning|sleep-cycle|code-task|deep-analysis|general",
      "preferredProvider": "gemini|claude|copilot|codex",
      "fallbackProviders": ["gemini|claude|copilot|codex"],
      "rationale": "string",
      "confidence": 0.0
    }
  ],
  "summary": "string"
}
```

## 5) Prompt Catalog e Schema IDs
Arquivo: src/core/llm-cli/PromptCatalog.ts

Task types e schema IDs atuais:
- summarization -> summary.v1
- enrichment -> event-enrichment.v1
- reranking -> rerank.v1
- proactive-planning -> proactive-plan.v1
- long-analysis -> analysis.v1
- code-automation -> code-automation.v1

## Contratos de Jobs API
Arquivo: app/api/v1/inference/jobs/route.ts

POST /api/v1/inference/jobs body minimo:
```
{
  "prompt": "string"
}
```

Campos opcionais:
- taskType
- preferredProvider
- fallbackProviders
- abTestKey
- promptClass (operational|sensitive)

Resposta inclui:
- id
- task
- routing
- promptProfile
