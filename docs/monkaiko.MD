# Para que serve o data e como ele se conecta ao código

O Vigil é um **agente autônomo de produtividade/observabilidade para desenvolvimento** (assistente que observa o que você faz, pensa sozinho, propõe ações e executa CLIs de LLM como Copilot/Claude/Gemini). O data é a **memória persistente** desse agente — sem ele, o sistema "esquece" tudo a cada reinício e não consegue raciocinar sobre o passado.

## A ideia central: ciclo cognitivo "observar → enriquecer → resumir → planejar → otimizar"

O código implementa um loop inspirado em ciclos cognitivos (com fases "acordado" e "sleep"). Cada subpasta de data corresponde a **uma etapa desse loop**:

```
        VOCÊ TRABALHA
              │
   (observers em src/observation/, terminal, API)
              ▼
   ┌──────────────────────────┐
   │ 1. data/logs/            │  ← memória de curto prazo (eventos brutos)
   └──────────────────────────┘
              │  EventEnrichmentService chama LLM
              ▼
   ┌──────────────────────────┐
   │ 2. data/logs/enriched/   │  ← eventos já com tags, classificação, relevância
   └──────────────────────────┘
              │  durante "sleep" (src/sleep/)
              ▼
   ┌──────────────────────────┐
   │ 3. data/summaries/daily  │  ← consolidação do dia (resumo legível + JSON)
   │    data/summaries/facts  │  ← conhecimento permanente extraído
   │    data/index/           │  ← embeddings vetoriais para busca semântica
   └──────────────────────────┘
              │  ProactivePlannerService lê eventos recentes
              ▼
   ┌──────────────────────────┐
   │ 4. data/proactive/       │  ← "o que devo fazer agora?" (riscos/oportunidades/tarefas)
   └──────────────────────────┘
              │  SelfOptimizationService lê métricas + benchmarks
              ▼
   ┌──────────────────────────┐
   │ 5. data/self-optimization│  ← "como eu (agente) posso melhorar?"
   └──────────────────────────┘

   Em paralelo, atravessando tudo:
   ┌──────────────────────────┐
   │ data/audit/llm-cli/      │  ← prova de tudo que cada CLI LLM fez
   └──────────────────────────┘
```

## O papel de cada peça no produto

| Subpasta | Para que serve no produto | Por que existe (finalidade técnica) |
|---|---|---|
| logs | "O que aconteceu hoje no meu ambiente?" | Memória de curto prazo. Alimenta enriquecimento, busca semântica e o planner proativo. Sem isso o agente não tem **contexto de evidência**. |
| `logs/enriched/` | Mesmos eventos, mas já interpretados pela LLM | Permite que o planner não precise reanalisar do zero — economiza tokens e dá **classificação consistente**. |
| `summaries/daily/` | Resumos diários que o usuário pode ler e o agente pode citar | Reduz volume (90d de logs → 1 resumo por dia). Usado no chat para responder "o que fiz ontem?". |
| `summaries/facts/` | Conhecimento permanente que sobrevive ao pruning | Memória de **longo prazo**: fatos verificados, contradições detectadas durante o ciclo de sleep. |
| `index/` | Busca semântica sobre toda a memória | Permite ao chat responder "quando vi este erro antes?" via embeddings. |
| `proactive/` | Sugestões autônomas de ação ("você deveria fazer X") | Núcleo do **comportamento proativo**: o agente decide sozinho o que sugerir, com risco/severidade/aprovação. |
| `self-optimization/` | O agente analisando o **próprio desempenho** | Meta-loop: lê métricas e benchmarks e propõe mudar configs/políticas/roteamento de provider. É a parte "auto-melhoria". |
| `audit/llm-cli/` | Trilha auditável de toda chamada LLM | Compliance, debugging e análise de custo/latência. Sem isso é impossível investigar "por que o agente sugeriu isso?". |
| `skills/` | Biblioteca de prompts/system-skills por fornecedor | Permite criar agentes pré-configurados (`AgentService`) usando prompts curados de Anthropic/OpenAI/Cursor/etc. |
| `conversations/` | Histórico de chat persistente | UX básica do chat (recarregar conversas). |
| `tasks.json` | Lista de tarefas | UX do dashboard. |
| `mcp-servers.json` | Configuração de servidores MCP | Permite que o agente use ferramentas externas via Model Context Protocol. |

## Casamento com a arquitetura do código

- observation **escreve** em logs (origem dos dados).
- memory **lê e indexa** logs, mantém `index/` e `conversations/`.
- `src/core/services/EventEnrichmentService` enriquece logs → `logs/enriched/`.
- sleep (Summarizer, Consolidator, SleepInferenceService, Pruning) é a fase de "consolidação noturna" — produz `summaries/` e aplica retenção.
- `src/core/services/ProactivePlannerService` é o **planejador autônomo** — produz `proactive/`.
- `src/core/services/SelfOptimizationService` é o **meta-otimizador** — produz `self-optimization/`.
- `src/core/llm-cli/CliAuditTrail` registra cada execução em `audit/llm-cli/`.
- `src/core/agents/externalSkillCatalog` carrega `skills/` para alimentar `AgentService`.
- `app/api/v1/...` expõe tudo isso via HTTP para o dashboard (Next.js em app).

## Por que esse design

1. **Persistência sem banco de dados**: arquivos JSON/Markdown em disco facilitam debug, versionamento manual, inspeção humana e portabilidade (basta copiar data).
2. **Particionamento por data**: permite pruning barato (`rm -rf data/logs/2026-04-01.log`) e leitura incremental (planner só pega N dias recentes).
3. **Append-only nos logs**: garante imutabilidade da auditoria e evita corrupção em escrita concorrente.
4. **Separação observação/decisão/auditoria**: cada loop tem seu diretório próprio, então falha em um não corrompe os outros.
5. **`VIGIL_DATA_DIR` configurável**: dá pra apontar pra outro disco/volume sem mudar código (útil em produção).

## Resumindo em uma frase

data **é o cérebro persistente do Vigil**: armazena o que ele observou, o que entendeu, o que lembra, o que decidiu sugerir, como ele mesmo vai melhorar e o histórico de tudo que conversou com cada LLM — exatamente o que torna o agente **contextual, proativo e auditável**.