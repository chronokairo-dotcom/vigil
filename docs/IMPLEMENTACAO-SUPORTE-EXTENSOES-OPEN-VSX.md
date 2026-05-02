# Implementacao de Suporte a Extensoes com Compatibilidade Open VSX

## Objetivo

Definir e padronizar como o projeto deve implementar, empacotar e publicar extensoes compativeis com o ecossistema Open VSX, seguindo as diretrizes de compatibilidade da wiki oficial:

- https://github.com/EclipseFdn/open-vsx.org/wiki

Este documento cobre arquitetura, requisitos tecnicos, pipeline de build/publicacao e criterios de validacao.

---

## Escopo

- Garantir que a extensao funcione em ambientes baseados em VS Code e em distribuicoes que consomem Open VSX.
- Evitar dependencia de APIs proprietarias nao suportadas fora do marketplace da Microsoft.
- Padronizar publicacao em Open VSX como canal oficial de distribuicao compativel.

---

## Principios de Compatibilidade

1. Priorizar APIs estaveis e publicas do VS Code.
2. Evitar acoplamento com servicos proprietarios obrigatorios para o funcionamento basico.
3. Manter fallback para recursos opcionais (ex.: autenticacao, telemetria, servicos externos).
4. Garantir que instalacao e ativacao funcionem apenas com o pacote VSIX publicado no Open VSX.

---

## Requisitos de Implementacao

## 1) Manifesto da Extensao

Checklist para `package.json` da extensao:

- Definir `name`, `displayName`, `description`, `version`, `publisher` e `engines.vscode` de forma consistente.
- Declarar `main` (Node extension host) e/ou `browser` (web extension) conforme alvo.
- Declarar `activationEvents` minimos necessarios para reduzir custo de ativacao.
- Declarar `contributes` apenas para pontos suportados e necessarios.
- Evitar configuracoes que dependam de comportamento exclusivo do marketplace da Microsoft.

## 2) Dependencias e Runtime

- Remover dependencia obrigatoria de binarios nao portaveis sem fallback.
- Verificar compatibilidade das dependencias Node com o extension host alvo.
- Se houver partes nativas, documentar matriz de suporte por SO/arquitetura.
- Tratar falhas de inicializacao de dependencia externa com mensagem clara ao usuario.

## 3) APIs e Funcionalidades

- Evitar APIs propostas/experimentais em producao sem estrategia de degradacao.
- Tratar capacidade indisponivel por meio de feature flags e fallback seguro.
- Garantir que comandos essenciais funcionem sem integracoes opcionais.

## 4) Identidade e Metadados

- Alinhar nome da extensao, publisher e semver entre codigo, CI e publicacao.
- Definir changelog e release notes por versao.
- Incluir licenca valida no repositorio e no pacote.

---

## Estrategia de Arquitetura no VIGIL

Para este repositorio, a camada de extensao deve seguir separacao por adaptadores:

- Camada de UI/comandos: expoe comandos e telas da extensao.
- Camada de integracao: adaptadores para APIs de editor e servicos externos.
- Camada core: logica de negocio independente do host.

Diretriz:

- Qualquer uso de recurso potencialmente nao-portavel deve passar por interface.
- Implementacao concreta deve possuir fallback ou no-op controlado.

Exemplo de interfaces recomendadas:

- `MarketplaceClient` (instalacao/consulta de extensoes)
- `AuthProvider` (autenticacao opcional)
- `TelemetryProvider` (telemetria opcional)
- `SecretsProvider` (armazenamento seguro com fallback local quando permitido)

---

## Pipeline de Build e Publicacao

## 1) Build Reproduzivel

- Fixar versao de Node e gerenciador de pacotes no CI.
- Rodar lint, typecheck e testes antes de empacotar.
- Gerar VSIX assinavel/reproduzivel por tag de release.

## 2) Empacotamento

- Validar conteudo final do VSIX (arquivos necessarios apenas).
- Excluir artefatos de desenvolvimento e segredos.
- Garantir tamanho e estrutura consistentes do pacote.

## 3) Publicacao Open VSX

Fluxo recomendado:

1. Gerar VSIX da versao.
2. Validar localmente instalacao e ativacao.
3. Publicar no Open VSX com credencial de automacao.
4. Verificar pagina da extensao e metadados apos publicacao.

Observacao:

- Token de publicacao deve ficar apenas em segredo de CI.
- Nunca versionar token em arquivo de repositorio.

---

## Compatibilidade Funcional (Matriz Minima)

Executar smoke tests em pelo menos:

- VS Code estavel (desktop)
- Um editor/distribuicao que consome Open VSX

Casos minimos:

1. Instalar extensao pelo marketplace Open VSX.
2. Ativar extensao por evento esperado.
3. Executar comandos principais.
4. Abrir views/painel da extensao (se aplicavel).
5. Validar fluxo sem login (modo degradado).
6. Validar fluxo com login (quando disponivel).
7. Atualizar versao e validar migracao de configuracoes.

---

## Checklist de Entrega

- [ ] Manifesto revisado para compatibilidade.
- [ ] Dependencias auditadas para portabilidade.
- [ ] Fallbacks implementados para recursos opcionais.
- [ ] CI com empacotamento e validacao de VSIX.
- [ ] Publicacao automatizada para Open VSX.
- [ ] Smoke tests executados em ambiente compativel.
- [ ] Documentacao de instalacao e troubleshooting atualizada.

---

## Riscos e Mitigacoes

## Risco: uso de API nao suportada no host alvo

Mitigacao:

- Encapsular chamadas em adaptadores.
- Detectar capacidade em runtime.
- Degradar funcionalidade com aviso claro.

## Risco: divergencia entre comportamento local e pacote publicado

Mitigacao:

- Testar sempre o VSIX gerado, nao apenas ambiente de desenvolvimento.
- Executar smoke tests em pipeline de release.

## Risco: falha de publicacao por metadado inconsistente

Mitigacao:

- Validar publisher/nome/versao em etapa de pre-release.
- Bloquear release com checklist automatizado.

---

## Proximos Passos no Repositorio

1. Criar pasta dedicada para extensao, se ainda nao existir, com manifesto proprio.
2. Implementar interfaces de adaptacao para recursos opcionais.
3. Adicionar workflow de CI para empacotar e publicar no Open VSX.
4. Criar suite de smoke tests para instalacao/ativacao pos-publicacao.
