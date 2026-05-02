# Relatorio de Implementacao - Gemini CLI em Segundo Plano

## Objetivo

Este documento registra a implementacao, os testes executados e o estado final da integracao do terminal do VIGIL com CLIs de IA executadas em segundo plano, com foco principal no Gemini CLI.

O objetivo funcional desta entrega foi garantir que o VIGIL consiga:

- executar prompts headless via CLI em background;
- receber o retorno em streaming no terminal da aplicacao;
- manter compatibilidade real com Windows;
- suportar a arquitetura futura em que as automacoes do produto usem CLIs de IA como workers de segundo plano.

---

## Contexto do Projeto

O VIGIL e um agente de IA persistente e proativo, orientado a observacao, memoria continua e acao autonoma. Em vez de operar apenas como assistente reativo por prompt manual, a plataforma foi desenhada para funcionar como uma camada cognitiva em background, com consolidacao de memoria, observabilidade, pipelines de decisao e execucao automatizada.

Na arquitetura atual:

- o frontend usa Next.js e React para dashboards, terminais e operacao do sistema;
- a API usa Route Handlers do App Router para eventos, auth, terminais e servicos versionados;
- o core engine centraliza agentes, memoria, observabilidade, pipelines e guardrails;
- o terminal tornou-se uma superficie importante para acionar CLIs de IA de forma interativa e tambem em modo prompt stream.

---

## Escopo Implementado

### 1. Terminal real com PTY

Foi consolidada a base do terminal com sessoes PTY reais, incluindo:

- spawn de processos via `node-pty`;
- SSE para saida incremental de sessao;
- envio de stdin para sessoes interativas;
- renderizacao real no frontend com `xterm.js`.

### 2. Prompt stream para CLIs de IA

Foi implementado um modo adicional de execucao no terminal para prompts headless:

- o usuario envia um prompt no rodape do `TerminalPanel`;
- o frontend chama `POST /api/terminal/stream`;
- o backend executa a CLI adequada;
- stdout, stderr e status de encerramento retornam em streaming;
- o texto recebido e renderizado diretamente na aba do terminal.

### 3. Compatibilidade de comandos

As rotas do terminal foram ajustadas para resolver diferencas reais entre CLIs:

- `Claude`: fallback entre `claude`, `claude-code` e `claude-ai`;
- `Gemini`: fallback entre `gemini` e `gemini-cli`;
- `Copilot`: `copilot -s -p` no modo stream e fallback para `gh copilot -- -s -p ...`;
- `Codex`: mantido como `codex`, mas dependente de instalacao local.

### 4. Estrategia Windows para Gemini

Nos testes reais, o Gemini mostrou comportamento sensivel a como o processo e iniciado no Windows. A estrategia que se provou mais estavel para a rota de stream foi manter o wrapper:

- `cmd.exe /d /c <commandLine>`

com quoting controlado no backend.

Essa forma foi preservada na rota de stream porque as tentativas de `spawn` direto do executavel real no Windows nao ficaram mais confiaveis do que o caminho ja validado.

---

## Arquivos Relevantes

- `src/screens/TerminalPanel.tsx`
- `app/api/terminal/stream/route.ts`
- `app/api/terminal/sessions/route.ts`
- `app/api/terminal/sessions/[sessionId]/route.ts`
- `app/api/terminal/sessions/[sessionId]/input/route.ts`

---

## Testes Executados com Gemini CLI

Os testes abaixo foram executados no ambiente Windows do workspace.

### Teste 1 - Smoke test headless

Comando:

```powershell
gemini -p "Responda apenas OK"
```

Resultado:

```text
OK
```

Conclusao:

- o Gemini CLI funciona em modo headless basico;
- a flag `-p` esta valida no ambiente atual.

### Teste 2 - Geracao tecnica estruturada

Comando:

```powershell
gemini -p "Resuma em 3 bullets a arquitetura do projeto Vigil com foco em frontend, API e core engine."
```

Resultado observado:

- o Gemini retornou tres bullets tecnicos coerentes sobre frontend, API e core engine;
- o modelo conseguiu inferir corretamente a estrutura do projeto a partir do repositorio.

Conclusao:

- o Gemini CLI e adequado para tarefas de documentacao e sumarizacao tecnica em background.

### Teste 3 - Wrapper Windows equivalente ao backend

Comando:

```powershell
cmd /d /c gemini -p "Liste em uma frase o objetivo do VIGIL"
```

Resultado observado:

- o Gemini retornou uma frase correta sobre o objetivo do projeto;
- o comando funcionou com o wrapper do Windows utilizado na rota de stream.

Conclusao:

- a estrategia do backend para Windows e funcional para o Gemini.

### Teste 4 - Prompt longo para documentacao

Comando:

```powershell
gemini -p "crie a documentacao do meu projeto"
```

Resultado observado:

- o Gemini gerou documentacao longa em Markdown sobre o projeto;
- a resposta foi suficientemente rica para uso como base documental;
- apareceu um aviso interno do proprio agente local sobre ferramenta indisponivel (`write_file`), mas a geracao textual foi concluida com sucesso e a resposta foi entregue.

Conclusao:

- o Gemini CLI funciona para geracao documental de maior volume;
- ele e viavel para tarefas de documentacao automatizada executadas em background.

### Teste 5 - Verificacao do problema de quoting em processos Node

Foi testado `child_process.spawn(..., { shell: true })` com argumentos separados para o Gemini.

Resultado:

- esse formato falhou com a mensagem:

```text
Cannot use both a positional prompt and the --prompt (-p) flag together
```

Conclusao:

- o `shell: true` do Node concatena argumentos de forma inadequada para o Gemini neste ambiente;
- por isso, a rota de stream deve manter a estrategia de wrapper `cmd /d /c` com quoting controlado, em vez de migrar para `shell: true` ou spawn direto experimental.

---

## Matriz de Compatibilidade Atual

| CLI | Modo interativo PTY | Modo prompt stream | Situacao atual |
| --- | --- | --- | --- |
| Claude | Inicializa, mas depende de login local | `--print` suportado, mas ambiente atual esta sem login | Parcial |
| Gemini | Funciona | Funciona | Estavel |
| Copilot | Funciona | Funciona melhor com `-s -p` | Estavel |
| Codex | Nao instalado neste ambiente | Nao instalado neste ambiente | Indisponivel localmente |

---

## Decisoes Tecnicas Consolidadas

### Decisao 1 - Manter wrapper Windows para Gemini stream

Motivo:

- foi o caminho que passou nos testes reais com prompt curto e longo;
- alternativas com `shell: true` quebraram parsing;
- alternativas com execucao direta do caminho resolvido nao provaram ganho de confiabilidade.

### Decisao 2 - Usar modo silencioso no Copilot stream

Motivo:

- `copilot -p` funcionava, mas devolvia saida muito verbosa;
- `copilot -s -p` retornou apenas o conteudo util;
- isso melhora a UX do terminal e deixa a saida previsivel para pipelines em background.

### Decisao 3 - Manter prompt stream separado do PTY interativo

Motivo:

- o PTY e ideal para login, TUI, autenticacao e interacao completa;
- o modo prompt stream e ideal para tarefas curtas, sumarizacao, documentacao e automacoes programaticas;
- a coexistencia dos dois modos cobre melhor os cenarios do produto.

---

## Commits Relacionados

Implementacoes recentes associadas a esta linha de trabalho:

- `8be17e8` - frontend do terminal com `xterm.js`
- `bda7e64` - unificacao do chrome do terminal no app bar compartilhado
- `7874655` - prompt stream com retorno ao vivo no terminal
- `964f40d` - compatibilidade de comandos para stream e PTY
- `e17072b` - modo silencioso no Copilot para stream limpo

---

## Status Final

Estado final da implementacao para Gemini CLI em segundo plano:

- prompt stream funcional;
- Gemini CLI validado com prompts curtos, estruturados e longos;
- wrapper Windows validado para o caso real do backend;
- integracao do terminal preparada para uso de CLIs de IA como workers de background;
- build do projeto validado apos os ajustes.

Conclusao operacional:

> O VIGIL esta apto para usar o Gemini CLI como mecanismo de execucao de tarefas de IA em segundo plano, especialmente para documentacao, sumarizacao tecnica, apoio operacional e automacoes baseadas em prompt stream.
