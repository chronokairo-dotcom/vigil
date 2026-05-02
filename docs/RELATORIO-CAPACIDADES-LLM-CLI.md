# Relatorio - Capacidades do VIGIL com LLM via CLI

## Objetivo

Este relatorio consolida a diferenca entre:

- as capacidades descritas no README do VIGIL;
- o que ja existe de fato no codigo;
- o que hoje usa LLM de verdade;
- o que ainda e implementado por heuristica, eventos ou agregacao local;
- como essas capacidades podem ser migradas para execucao com `gemini-cli`, preservando espaco para `claude`, `copilot` e outras CLIs.

---

## Resumo Executivo

O VIGIL ja possui infraestrutura real para uso de LLM em duas frentes:

- chat com ferramentas no core;
- terminal com execucao de CLIs de IA em segundo plano.

Entretanto, varias capacidades centrais prometidas no README ainda nao usam LLM no runtime atual. Em especial:

- memoria append-only existe, mas e persistencia bruta;
- observacao continua existe, mas e orientada a eventos;
- consolidacao e sumarizacao existem, mas sem interpretacao semantica por modelo;
- recall existe, mas com busca textual e ranking local, nao com pipeline semantico completo.

Conclusao:

> O VIGIL ja esta pronto para usar CLIs de LLM como camada cognitiva de segundo plano, mas ainda nao converteu varias capacidades do README em fluxos de inferencia reais.

---

## Base Tecnica Ja Existente

### Superficies reais de LLM

Ja existe base concreta para execucao de modelos e CLIs:

- `src/core/chat/chatWithTools.ts`
- `src/core/providers/multi-provider.ts`
- `src/screens/TerminalPanel.tsx`
- `app/api/terminal/stream/route.ts`
- `app/api/terminal/sessions/route.ts`

Isso significa que o projeto nao precisa inventar uma arquitetura nova do zero. A camada faltante e, principalmente, conectar as capacidades do README a uma interface comum de execucao de LLM em background.

### Base nao-LLM que deve ser aproveitada

Ja existem componentes fortes que devem permanecer como fundamento do sistema:

- `src/memory/memoryManager.ts`
- `src/observation/EventBus.ts`
- `src/observation/PersistentEventBus.ts`
- `src/core/services/AutoSyncService.ts`
- `src/sleep/consolidator.ts`
- `src/sleep/summarizer.ts`
- `src/recall/retriever.ts`
- `src/recall/contextBuilder.ts`
- `src/policies/approvalFlow.ts`

Esses modulos nao devem ser descartados. Eles devem se tornar o substrato observacional e de persistencia sobre o qual as CLIs de LLM passam a operar.

---

## Auditoria de Capacidades

| Capacidade do README | Existe no codigo | Usa LLM hoje | Diagnostico |
| --- | --- | --- | --- |
| Append-Only Memory Logs | Sim | Nao | Implementado como log persistente em arquivo, sem interpretacao de modelo |
| Continuous Observation | Sim | Nao | Implementado com event bus, file watcher e sync service |
| Proactive Execution | Parcial | Parcial | Existe base de daemon, eventos e pipelines, mas nao como raciocinio LLM continuo consolidado |
| Memory Consolidation (Sleep Cycle) | Sim | Nao | Consolidacao e sumarizacao por contagem/agregacao, sem inferencia de modelo |
| Contextual Recall Engine | Sim | Nao | Recuperacao por SQL LIKE + ranking local, nao por semantica robusta |
| Self-Optimization | Parcial | Parcial | Existem servicos e agentes conceituais, mas nao como loop operacional fechado e evidente |
| Background Runtime Layer | Sim | Parcial | Runtime existe, inclusive terminal e auto-sync, mas a camada cognitiva LLM continua nao cobre tudo |
| Benchmarks | Sim | Nao diretamente | Benchmark e calculo sobre metricas; nao ha benchmarking por juizo de LLM no servico lido |
| Safety & Approval | Sim | Nao | Fluxos de aprovacao e guardrails existem sem depender de modelo |

---

## Diagnostico por Capacidade

### 1. Append-Only Memory Logs

Estado atual:

- implementado via `MemoryManager.log()` em `data/logs/*.log`;
- persistencia append-only funcional.

Gap:

- o log nao recebe classificacao semantica por LLM;
- nao ha enrichment automatico com entidades, resumo, importancia, intencao ou causalidade.

Migracao sugerida com CLI:

- a cada lote de eventos, disparar `gemini-cli` em modo background para extrair:
  - tipo semantico do evento;
  - severidade;
  - tags;
  - entidade/projeto afetado;
  - relevancia para memoria de longo prazo.

### 2. Continuous Observation

Estado atual:

- observadores e barramento de eventos existem;
- `AutoSyncService` monitora arquivos com `chokidar`.

Gap:

- o sistema observa, mas nao interpreta continuamente com LLM os sinais observados.

Migracao sugerida com CLI:

- eventos observados devem alimentar uma fila assincorna de inferencia em segundo plano;
- o `gemini-cli` deve atuar como processador de interpretacao de evento, nao como substituto do observer.

### 3. Proactive Execution

Estado atual:

- existe base para eventos, automacao e aprovacao;
- o README promete comportamento mais autonomo do que o runtime evidencia hoje.

Gap:

- falta um planejador/propositor sistematico orientado por LLM que gere hipoteses de acao e propostas concretas.

Migracao sugerida com CLI:

- usar `gemini-cli` para converter contexto recente + memoria relevante em:
  - oportunidades;
  - riscos;
  - sugestoes de task;
  - requests de aprovacao.

### 4. Memory Consolidation / Sleep Cycle

Estado atual:

- consolidacao existe;
- sumarizacao existe;
- pruning existe.

Gap:

- o resumo atual e estatistico e estrutural, nao interpretativo.

Migracao sugerida com CLI:

- `gemini-cli` deve gerar:
  - resumo narrativo diario;
  - fatos consolidados;
  - contradicoes detectadas;
  - memorias candidatas a promoted facts;
  - memorias candidatas a descarte.

### 5. Contextual Recall Engine

Estado atual:

- recuperacao por SQL LIKE + ranking.

Gap:

- isso nao entrega recall semantico forte;
- o `VectorStore` existe, mas nao aparece como pipeline completo de embeddings e retrieval em producao.

Migracao sugerida com CLI:

- curto prazo: usar `gemini-cli` para reranking semantico dos itens recuperados heuristica/SQL;
- medio prazo: adicionar embeddings reais e manter a CLI para reranking e compaction do contexto.

### 6. Self-Optimization

Estado atual:

- ha conceitos, agentes e servicos relacionados;
- nao e uma rotina nitida e comprovada de auto-melhoria continua.

Gap:

- falta fechamento do loop: observar -> diagnosticar -> propor -> validar -> aprender.

Migracao sugerida com CLI:

- usar `gemini-cli` para analise periodica de metricas, gargalos, falhas e comportamento do sistema;
- gerar hipoteses de otimização e tasks internas.

---

## Diretriz de Arquitetura

### Recomendacao principal

Criar uma camada unica de abstracao para execucao de CLIs de LLM em background.

Nome sugerido:

- `src/core/llm-cli/`

Componentes sugeridos:

- `LlmCliAdapter.ts`
- `GeminiCliAdapter.ts`
- `ClaudeCliAdapter.ts`
- `CopilotCliAdapter.ts`
- `CliTaskQueue.ts`
- `CliInferenceService.ts`
- `CliResultNormalizer.ts`
- `CliPolicyGate.ts`

### Contrato minimo sugerido

```ts
export interface LlmCliRequest {
  taskType: string;
  prompt: string;
  cwd?: string;
  timeoutMs?: number;
  stream?: boolean;
  metadata?: Record<string, unknown>;
}

export interface LlmCliChunk {
  type: 'stdout' | 'stderr' | 'status';
  text: string;
}

export interface LlmCliResult {
  ok: boolean;
  rawText: string;
  exitCode: number | null;
  provider: string;
  modelHint?: string;
}

export interface LlmCliAdapter {
  id: string;
  isAvailable(): Promise<boolean>;
  run(req: LlmCliRequest): Promise<LlmCliResult>;
  stream?(req: LlmCliRequest, onChunk: (chunk: LlmCliChunk) => void): Promise<LlmCliResult>;
}
```

### Politica recomendada

- `gemini-cli` como implementacao primaria;
- `claude` e `copilot` como fallbacks por disponibilidade ou tipo de tarefa;
- toda chamada deve passar por policy/approval quando gerar modificacao de estado;
- respostas devem ser normalizadas em JSON quando possivel, ou parseadas por schema quando vierem em texto.

---

## Recomendacao de Priorizacao

### Fase 1 - Interpretacao de eventos e memoria

Maior retorno com menor acoplamento:

- enrich de eventos observados;
- resumo de sleep cycle via CLI;
- classificacao de memoria relevante.

### Fase 2 - Recall e contexto

- reranking semantico via CLI;
- selecao de contexto para tasks futuras;
- deteccao de contradicoes em memoria.

### Fase 3 - Proatividade e auto-otimizacao

- geracao automatica de sugestoes;
- criacao de tasks internas;
- loop de revisao de benchmark e comportamento do sistema.

---

## Risco Principal

O maior risco atual e documental/arquitetural:

> o README descreve uma camada cognitiva com memoria e consolidacao de natureza semantica, mas a implementacao atual ainda delega essas partes centrais sobretudo a logica deterministica, busca textual e agregacao local.

Esse gap nao invalida a base do projeto. Ao contrario: a base esta boa. O problema e de fechamento da camada de inferencia, nao de fundacao.

---

## Conclusao

O VIGIL ja tem a espinha dorsal necessaria para evoluir para uma plataforma de memoria, observacao e proatividade realmente orientada por LLM em background.

Para isso, a estrategia correta nao e reescrever memoria, observacao ou guardrails. A estrategia correta e:

1. preservar a infraestrutura atual;
2. adicionar uma camada de abstracao de CLIs de LLM;
3. plugar `gemini-cli` primeiro;
4. manter compatibilidade com outras CLIs;
5. migrar gradualmente cada capacidade do README para inferencia real.
