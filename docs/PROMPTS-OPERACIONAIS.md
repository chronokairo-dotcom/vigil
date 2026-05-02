# Prompts Operacionais LLM-CLI

## Principios
- Sempre retornar JSON quando o contrato exigir estrutura.
- Nao retornar markdown, comentarios ou texto extra em rotas estruturadas.
- Manter provider-agnostic (sem sintaxe exclusiva de uma CLI).

## 1) Event Enrichment
Servico: EventEnrichmentService
Objetivo: classificar eventos e gerar sinais semanticos.

Template (resumo):
- contexto: lote de eventos com id/source/content/timestamp
- instrucao: retornar apenas array JSON com campos id, classification, tags, relevance, entities, suggestedAction
- regras: relevance 0..1, acao curta e pratica

Schema ID: event-enrichment.v1
Provider default: gemini
Fallback: claude, copilot, codex

## 2) Sleep Cycle Summary
Servico: SleepInferenceService
Objetivo: gerar resumo diario, fatos permanentes e contradicoes.

Template (resumo):
- contexto: consolidacao + eventos do dia
- instrucao: retornar apenas objeto JSON com narrativeSummary, keyChanges, permanentFacts, contradictions, pruningSuggestions
- regras: scores 0..1, arrays vazios quando nao houver sinal

Schema ID: summary.v1
Provider default: gemini
Fallback: claude, copilot, codex

## 3) Proactive Planner
Servico: ProactivePlannerService
Objetivo: inferir riscos, oportunidades, tarefas e recomendacoes.

Template (resumo):
- contexto: eventos enriquecidos recentes
- instrucao: retornar apenas objeto JSON com risks, opportunities, taskCandidates, recommendations
- regras: requiresApproval para tarefas sensiveis

Schema ID: proactive-plan.v1
Provider default: gemini
Fallback: claude, copilot, codex

## 4) Semantic Rerank
Servico: SemanticRerankService / Recall
Objetivo: reranquear itens top-N por relevancia semantica.

Template (resumo):
- contexto: query + itens recuperados
- instrucao: ordenar por relevancia e justificar selecao curta por item

Schema ID: rerank.v1
Provider default: gemini
Fallback: claude, copilot, codex

## 5) Benchmark Interpretation
Servico: BenchmarkInterpretationService
Objetivo: traduzir benchmark quantitativo em politica de roteamento.

Template (resumo):
- contexto: benchmark report por periodo
- instrucao: retornar objeto JSON com modelExplanations, routingPolicy, summary
- regras: confidence 0..1, incluir entry general

Schema ID: analysis.v1 (interpretacao/routing)
Provider default: gemini
Fallback: claude, copilot, codex

## 6) Code Automation
Roteamento por taskType: code-automation
Objetivo: tarefas de codigo e automacao de repositorio.

Schema ID: code-automation.v1
Provider default: copilot
Fallback: claude, gemini, codex

## Boas praticas de manutencao
- Versionar schema IDs em mudancas breaking (ex: *.v2).
- Manter parser + fallback sincronizados com prompt.
- Testar prompts curtos/longos e saida invalida regularmente.
