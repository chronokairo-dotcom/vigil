# Arquitetura LLM-CLI

## Objetivo
Este documento descreve a arquitetura de inferencia em CLI do Vigil com foco em:
- gemini-cli como padrao inicial;
- compatibilidade estrutural com claude, copilot e codex;
- roteamento por tipo de tarefa com fallback e A/B test.

## Componentes Principais

### Camada core
- src/core/llm-cli/types.ts
  - Tipos centrais: provider, request, result, task de fila.
- src/core/llm-cli/adapters.ts
  - Adaptadores por provider (gemini, claude, copilot, codex).
- src/core/llm-cli/LlmCliRegistry.ts
  - Registro de providers e verificacao de disponibilidade.
- src/core/llm-cli/CliInferenceService.ts
  - Execucao de prompt com timeout, retry, telemetria, auditoria e fallback.
- src/core/llm-cli/CliTaskQueue.ts
  - Fila em background para jobs de inferencia.
- src/core/llm-cli/CliExecutionPolicy.ts
  - Politicas de retry, timeout, aprovacao e persistencia de prompt/output.
- src/core/llm-cli/CliAuditTrail.ts
  - Trilha de auditoria por inferencia.
- src/core/llm-cli/SecretRedactor.ts
  - Redacao de segredos antes da execucao.

### Camada de compatibilidade multi-CLI (Fase 10)
- src/core/llm-cli/PromptCatalog.ts
  - Catalogo de task types e schema IDs, provider preferencial por tarefa.
- src/core/llm-cli/ProviderCapabilityMatrix.ts
  - Matriz de capacidade por provider e tipo de tarefa.
- src/core/llm-cli/ProviderRoutingStrategy.ts
  - Resolver de roteamento com:
    - default provider;
    - task override;
    - fallback por tarefa;
    - atribuicao deterministica de A/B test.

### Camada API
- app/api/v1/inference/jobs/route.ts
  - GET: lista jobs/stats ou busca por taskId.
  - POST: enfileira job; resolve provider/fallback com estrategia configuravel.
- app/api/v1/inference/capabilities/route.ts
  - Exposicao da matriz de capacidade, prompt profiles e defaults resolvidos.
- app/api/_lib/llm-cli-routing.ts
  - Carrega config de roteamento do SettingsService.

## Fluxo de Execucao
1. Cliente envia POST /api/v1/inference/jobs com prompt e contexto de tarefa.
2. API resolve taskType e carrega config de roteamento do workspace.
3. ProviderRoutingStrategy define preferredProvider e fallbackProviders.
4. Job entra na CliTaskQueue.
5. CliInferenceService executa provider preferencial.
6. Em falha/timeout, aplica retry e fallback de provider.
7. CliAuditTrail registra provider, comando, duracao, exit code.
8. Resultado fica disponivel para GET /api/v1/inference/jobs.

## Configuracao por Workspace
As configuracoes de roteamento sao lidas de ai.provider.* no settings:
- ai.provider.routing.defaultProvider
- ai.provider.routing.fallbackOrder
- ai.provider.routing.taskOverrides
- ai.provider.routing.abTests

## Decisoes de Projeto
- Prompt templates e schemas nao dependem de sintaxe exclusiva de um provider.
- Roteamento e separado da execucao, permitindo evolucao independente.
- A/B test e deterministico por chave de contexto para consistencia.
- fallback e filtrado por capacidade suportada para evitar escolhas invalidas.

## Pontos de Extensao
- Novos providers: adicionar adapter + registro + matriz.
- Novos task types: adicionar no PromptCatalog + matriz + estrategia.
- Novas politicas: extender CliExecutionPolicy.
- Roteamento avancado por benchmark: integrar rules dinamicas no loadRoutingConfig.
