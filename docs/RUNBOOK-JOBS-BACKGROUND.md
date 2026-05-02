# Runbook - Jobs de Inferencia em Background

## Objetivo
Operar, diagnosticar e recuperar o pipeline de jobs em background de inferencia CLI.

## Endpoints

### 1) Enfileirar job
POST /api/v1/inference/jobs

Body minimo:
```
{
  "prompt": "Explique os principais riscos dos eventos recentes"
}
```

Body completo (opcional):
```
{
  "prompt": "...",
  "taskType": "proactive-planning",
  "preferredProvider": "gemini",
  "fallbackProviders": ["claude", "copilot", "codex"],
  "abTestKey": "workspace-123",
  "promptClass": "operational"
}
```

### 2) Listar jobs
GET /api/v1/inference/jobs

### 3) Consultar job especifico
GET /api/v1/inference/jobs?taskId=<id>

### 4) Ver matriz/capacidades
GET /api/v1/inference/capabilities

## Sinais de Saude
- stats.queued crescendo sem queda: possivel gargalo de execucao.
- stats.failed alto: provider indisponivel, timeout, ou schema invalido recorrente.
- tempos altos em durationMs: revisar timeout/prompt/tamanho de input.

## Diagnostico Rapido
1. Verificar estado dos jobs (GET /inference/jobs).
2. Inspecionar ultimo task.result:
   - provider
   - command
   - exitCode
   - stderr
   - timedOut
3. Conferir roteamento efetivo retornado no POST:
   - preferredProvider
   - fallbackProviders
   - reason
4. Validar capabilities/defaults (GET /inference/capabilities).

## Falhas Comuns e Acoes

### PROMPT_REQUIRED
- Causa: body sem prompt.
- Acao: reenviar com prompt valido.

### NOT_FOUND (taskId)
- Causa: id inexistente/expirado.
- Acao: listar jobs e usar id valido.

### INTERNAL_ERROR em enqueue/list
- Causa: erro de runtime, settings ou fila.
- Acao:
  1) revisar logs do servidor
  2) validar settings ai.provider.routing.*
  3) verificar disponibilidade de CLIs

### Timeout
- Sinal: result.timedOut = true, error menciona timeout.
- Acao:
  1) reduzir tamanho do prompt
  2) ajustar timeout/politica
  3) usar provider alternativo via override

### Parse/schema invalido
- Sinal: output fallback nos servicos consumidores.
- Acao:
  1) revisar template de prompt
  2) reforcar instrucao de JSON estrito
  3) validar no documento de schemas

## Operacao de Roteamento
- Override por tarefa: routing.taskOverrides
- Default global: routing.defaultProvider
- Fallback global: routing.fallbackOrder
- A/B test: routing.abTests

Aplicacao da config:
- Carregamento por workspace via app/api/_lib/llm-cli-routing.ts
- Resolucao final por ProviderRoutingStrategy

## Auditoria e Seguranca
- Inference audit registra provider, comando, duracao e exitCode.
- Prompt sensivel pode exigir approval dependendo da policy.
- Secret redaction e aplicado antes da execucao quando habilitado.

## Checklist de Recuperacao
- [ ] Confirmar disponibilidade de pelo menos 1 provider.
- [ ] Confirmar queue processando (running varia ao longo do tempo).
- [ ] Confirmar fallback configurado sem duplicatas.
- [ ] Confirmar taskType correto para o objetivo.
- [ ] Confirmar schema/output valido no servico consumidor.
