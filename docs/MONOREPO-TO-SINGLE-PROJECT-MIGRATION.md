# Migração: Monorepo → Projeto Único
## Pendências Restantes

**Data**: Abril 2026
**Status**: Fases 1-9 concluídas — estrutura alvo implementada

---

## Pendências de Validação

- [ ] Rodar `pnpm test` e confirmar suite completa passa
- [ ] Verificar CLI funcional: `node dist/interfaces/cli/index.js --help`
- [ ] Verificar API/MCP funcional: `node dist/interfaces/api/start-api.js`
- [ ] Verificar VS Code extension faz bundle: `pnpm build:vscode`
- [ ] Resolver os 289 erros de tipo pré-existentes em `src/core/agents/` e `src/core/providers/` (herdados do packages/core, não causados pela migração)

---

## Pendências de Documentação

- [ ] Atualizar `docs/architecture/TECHNICAL_ARCHITECTURE.md` (remover referências ao monorepo)
- [ ] Atualizar `docs/deployment/DEPLOYMENT_CHECKLIST.md` (novos paths de build)

---

## Fase 10: Merge & Release

- [ ] Abrir PR para merge no `main`
- [ ] Tag nova versão (ex: `v2.0.0`)
- [ ] Deploy
