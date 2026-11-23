# Projeto atual e pronto para agentes de IA — design

Data: 2026-11-23 · Branch: `perf/base-cloud` (a mesma da base rápida; um único teste no Windows cobre as duas)

## Intenção

Deixar o Plaid atualizado e, principalmente, atual: o melhor gerenciador de pacotes, todas as dependências na última
versão que funciona no projeto, e as ferramentas que o ecossistema usa hoje. E fazer com que um agente de IA que abra
uma sessão nova saiba sozinho o contexto do projeto, quais ferramentas existem, como testar e como verificar o próprio
trabalho, sem depender de memória de conversa.

## Estado atual (achado em 2026-11-23, depois da base rápida)

- Gerenciador: npm 11 com `package-lock.json` (lockfile v2). `.nvmrc` = `v24`. Sem `packageManager` nem `engines`.
- Versões: Angular 21.2.26, TypeScript 5.9.3, zone.js 0.15.1, Electron 45.4.1, Playwright 1.65.1, Jest 30 +
  jest-preset-angular 17, `@types/node` 22. Pacotes descontinuados em uso: `@angular/animations` (não importado em
  lugar nenhum) e `@angular/platform-browser-dynamic` (só em `src/main.ts`). `ts-node` parece sem uso.
- Últimas versões compatíveis hoje: Angular 22.3.0 (exige TypeScript `>=6.0 <6.1` e Node `^22.22.3 || ^24.15.0 ||
  >=26`), TypeScript 6.0.3 (o 7.0 existe, mas o Angular 22 não aceita), Node 26.13.1 LTS (27 é alfa), zone.js 0.16.3,
  Vitest 5.1.1 (o builder de testes do Angular 22 aceita `^4.0.8 || ^5.0.0`), pnpm 12.23.0, Biome 2.6.8, Prettier
  3.10.1, `@types/node` 26.
- Testes: 11 arquivos Jest (88 testes) e 8 testes Playwright. APIs do Jest usadas: `jest.fn`, `jest.spyOn`,
  `jest.Mock`, `jest.useFakeTimers`/`advanceTimersByTime`/`useRealTimers`; dois arquivos usam callback `done`
  (`worklog.state.spec.ts`, `issue.state.spec.ts`), que o Vitest não aceita. Há um mock por `moduleNameMapper`
  (`src/__mocks__/electron.service.ts`).
- Checagem: nenhum linter nem formatador; as regras de estilo do `CLAUDE.md` não são verificadas por ferramenta.
  Não há script de checagem de tipos. Não há CI (`.github/` não existe).
- `.browserslistrc` diz `Electron 8.2.1`, o que gera aviso de navegador sem suporte em todo build.
- Contexto para agentes: só `CLAUDE.md` (com comandos npm). `.claude/` está no `.gitignore` por escolha do usuário.
- Ambiente: WSL com Node 24.11.1 e pnpm 10 instalados; Windows (`C:\dev\plaid`) com Node 24.22.3 e npm 11.

## Objetivos

1. pnpm como único gerenciador, com a versão fixada no projeto; instalação limpa e reprodutível.
2. Todas as dependências na última versão compatível com o projeto, sem pacote descontinuado e sem pacote sem uso.
3. Node 26 LTS como versão do projeto (`.nvmrc`, `engines`, CI).
4. Testes unitários no Vitest pelo builder oficial do Angular, com os mesmos 88 testes (nenhum perdido).
5. Biome fazendo lint e formatação do código; Prettier formatando só o que o Biome não alcança (templates Angular);
   erros de tipo nos templates pegos pelo compilador do Angular em modo estrito.
6. Um comando único e rápido de checagem que um agente roda para se conferir, e o mesmo comando no CI do GitHub.
7. `AGENTS.md` como fonte única de contexto para qualquer agente; `CLAUDE.md` aponta para ele.

## Fora do escopo

- Mudar comportamento ou visual do app; features novas.
- Migrar componentes para standalone/signals/zoneless (só o que o `ng update` fizer sozinho).
- TypeScript 7 (bloqueado pelo Angular 22).
- Modo estrito do TypeScript (`strict`). O TypeScript 6 o liga por padrão; aqui ele fica desligado explicitamente e
  vira o projeto seguinte (decisão do usuário, ver "Como" §2).
- Versionar `.claude/` (configurações, skills ou hooks do Claude Code ficam fora do repositório, como hoje).
- Gerar instalador no CI ou publicar release.
- `webSecurity: false` e outros temas de segurança do Electron.

## Anti-objetivos (falha mesmo que "funcione")

- Silenciar conflito de versão para instalar (`peerDependencyRules.allowAny`, `overrides` forçando versão
  incompatível) sem motivo registrado no design ou no plano.
- Desligar regra de lint ou teste só para passar, sem motivo escrito ao lado (comentário ou config).
- Perder testes na migração para o Vitest (contagem menor que 88) ou testes que "passam" porque não rodam.
- Misturar a formatação em massa com mudanças de lógica no mesmo commit.
- Dois gerenciadores convivendo (`package-lock.json` e `pnpm-lock.yaml`).
- `AGENTS.md` citando comando, script ou caminho que não existe.
- Mudança de comportamento do app escondida dentro da atualização.

## Abordagens consideradas (escolhidas pelo usuário)

**Gerenciador de pacotes**
- *pnpm* — **escolhido**. Rápido, recusa dependência não declarada, lockfile estável, bem suportado por Angular e
  Electron. Risco: o `electron-builder` pode precisar de `node-linker=hoisted`.
- *Bun* — o mais rápido, mas menos estrada com `electron-builder` e no Windows.
- *npm* — nenhuma mudança, o mais lento. *Yarn* — o modo PnP quebra ferramentas; o modo `node_modules` não acrescenta
  nada ao pnpm.

**Testes unitários**
- *Vitest* — **escolhido**. Padrão oficial do Angular desde a 21 (`@angular/build:unit-test`). Custa migrar 11 arquivos.
- *Jest 30* — sem migração, mas fora do caminho oficial.

**Checagem de código**
- *Biome + Prettier só nos templates* — **escolhido**. O Biome ainda não entende templates Angular (o suporte a HTML
  cobre Vue/Svelte/Astro; o pedido do Angular, biomejs/biome#9513, segue aberto).
- *Só Biome* — templates sem formatação nem lint.
- *ESLint (angular-eslint) + Prettier* — lint também nos templates, mais lento; o usuário prefere o Biome.

## Como (decidido)

### 1. pnpm
- `packageManager: "pnpm@12.23.0"` no `package.json`; `pnpm-lock.yaml` versionado; `package-lock.json` removido.
- Configurações do pnpm em `pnpm-workspace.yaml` (formato atual do pnpm).
- Scripts de build de dependências: só os necessários liberados explicitamente (lista mínima, cada um justificável).
- `electron-builder`: primeiro com o layout padrão do pnpm; se gerar app quebrado ou falhar, `node-linker=hoisted`.
  A prova é gerar o app empacotado (`electron-builder --dir`) e abri-lo.
- Instalação sem aviso de peer dependency não resolvida.

### 2. Versões
- Node 26 LTS: `.nvmrc` = `26`, `engines.node` = `>=26`.
- TypeScript: `"strict": false` explícito no `tsconfig.base.json`, com comentário dizendo por quê: o TypeScript 6 liga
  o modo estrito por padrão, o projeto nunca o usou, e ligá-lo exige mexer em ~160 campos de componentes e no
  tratamento de nulos (sem `!`), com risco de mudar comportamento. Fica como projeto seguinte, com prova própria.
- Angular 22.3 (todos os pacotes `@angular/*`, CLI, build) via `ng update`, aceitando as migrações automáticas que ele
  aplicar; TypeScript `~6.0`; zone.js 0.16; Electron e Playwright na última; `@types/node` 26.
- Removidos: `@angular/animations`, `@angular/platform-browser-dynamic` (`src/main.ts` passa a usar `platformBrowser`),
  `ts-node`, `@angular-devkit/build-angular` e `postcss` se confirmados sem uso, e tudo do Jest (`jest`, `jest-environment-jsdom`, `jest-preset-angular`,
  `@types/jest`, `jest.config.js`, `setup-jest.ts`, `tsconfig.spec.json` se não servir mais).
- `.browserslistrc` passa a refletir o Chromium do Electron 45 (ou sai, se o padrão do Angular cobrir), sem o aviso de
  navegador sem suporte no build.

### 3. Vitest
- Builder `@angular/build:unit-test` com runner Vitest e ambiente jsdom; `pnpm test` roda os testes uma vez (sem watch).
- Migração dos 11 arquivos: `jest.*` → `vi.*`; callbacks `done` viram testes síncronos ou com Promise; o mock do
  `ElectronService` continua funcionando (mecanismo do Vitest equivalente ao `moduleNameMapper`).
- O teste de zone (`plaid.module.spec.ts`) continua provando que o app sobe com detecção por zone.

### 4. Biome + Prettier
- Biome: lint (regras recomendadas) e formatação de `.ts`, `.js`, `.json` e, se o Biome já formatar SCSS, `.scss`.
  Formatação seguindo o estilo atual: aspas simples, ponto e vírgula, 2 espaços, linha até 140.
- Regras que quebram o Angular ficam ajustadas com o motivo na config — em especial `useImportType`, que transformaria
  imports usados na injeção de dependência pelo construtor em `import type`.
- Prettier: só `*.html` (templates) e `*.scss` se o Biome não cobrir, com as mesmas opções de largura e aspas.
- Templates: `strictTemplates` ligado no compilador; os erros que aparecerem são corrigidos com tipos, sem mudar
  comportamento. Sem `strictNullChecks` ele pega tipos errados nos bindings, mas não nulos; a checagem de nulos nos
  templates chega junto com o modo estrito, no projeto seguinte.
- A primeira formatação em massa fica num commit só dela, listado em `.git-blame-ignore-revs`.

### 5. Comandos
- `pnpm check`: checagem rápida para agente e CI — Biome (lint + formato), Prettier (`--check`), checagem de tipos
  (app e testes) e testes unitários. Sai com erro se qualquer parte falhar.
- Também: `pnpm lint`, `pnpm format` (aplica Biome + Prettier), `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`,
  `pnpm build`, e os de execução que já existem (`serve-dev`, `start-dev`, `start`, `package`).

### 6. CI (GitHub Actions)
- Em push e pull request: instalação com lockfile congelado, `pnpm check`, `pnpm build` e `pnpm test:e2e` (Chromium),
  no Ubuntu com Node 26.

### 7. Contexto para agentes
- `AGENTS.md` na raiz, fonte única, curto e verificável:
  - o que é o projeto e para quem (Jira Cloud só; por quê);
  - setup (Node 26, pnpm, primeira execução baixa o Electron, Chromium do Playwright);
  - comandos e quando usar cada um; o que é "pronto" (`pnpm check` verde; e2e quando mexer em fluxo de tela);
  - como provar cada tipo de mudança (lógica → Vitest; fluxo de tela → Playwright com Jira falso em `e2e/fake-jira.ts`;
    Electron → abrir o app; salvar no Jira real → só teste manual);
  - arquitetura (facade → api → state, cache, interceptors e a ordem deles) e convenções de código;
  - armadilhas conhecidas: zone.js obrigatório, só Jira Cloud, WSL (aceleração de GPU, `cmd.exe` para Windows),
    teste manual no Windows em `C:\dev\plaid`, Electron baixado na primeira execução;
  - onde estão specs e planos (`docs/superpowers/`).
- `CLAUDE.md`: importa o `AGENTS.md` (`@AGENTS.md`) e guarda só o que for específico do Claude Code.
- README: seção de desenvolvimento com pnpm e Node 26.

## Testes (uma prova de cada coisa; suíte inteira uma vez no fim)

| Prova | O que cobre | Custo estimado |
|---|---|---|
| Instalação limpa com lockfile congelado | pnpm, versões, scripts de build liberados, nenhum aviso de peer | ~3 min |
| Contagem de testes antes/depois | Vitest roda os 88 testes migrados (mesmos nomes) | ~2 min |
| `pnpm check` verde | Biome, Prettier, tipos (incl. templates estritos), unitários | ~1 min por rodada |
| Build de produção + Electron abre | Angular 22 e Electron com pnpm | ~2 min |
| App empacotado (`electron-builder --dir`) abre | `electron-builder` com pnpm | ~5 min |
| Playwright (8 testes) | fluxos de tela com Angular 22 | ~1 min |
| CI verde no GitHub | o mesmo `pnpm check` + build + e2e fora da máquina local | ~10 min de espera |
| Manual no Windows (usuário) | Node 26 + pnpm no Windows; roteiro da base rápida (abrir, login, semanas, adicionar/editar/excluir) | ~10 min do usuário |

## Decisões do Claude (revisar)

- Node 26 LTS e não 27 (alfa); `@types/node` 26 para casar com o runtime de desenvolvimento.
- TypeScript 6.0, a última aceita pelo Angular 22.
- `strict: false` explícito agora, modo estrito como projeto seguinte (proposto pelo Claude, aceito pelo usuário).
- Formatação segue o estilo atual do projeto (aspas simples, ponto e vírgula, 140 colunas), não o padrão do Biome.
- `useImportType` (e regras parecidas) ajustadas para não quebrar a injeção de dependência do Angular.
- `strictTemplates` ligado; se a correção dos templates exigir mudança de comportamento, a regra volta ao modo atual
  para aquele caso e o motivo fica registrado.
- `AGENTS.md` como fonte única (lido por vários agentes); `CLAUDE.md` só importa e complementa.
- CI roda e2e, mas não empacota o Electron.
- No WSL o Node 26 entra pelo `fnm` (já instalado, lê o `.nvmrc`).
- No Windows o Node 26 não traz o Corepack; o pnpm é instalado à parte (`npm install -g pnpm@12` ou winget) e o campo
  `packageManager` garante a versão.

## Deixado para quem constrói

- Ordem dos commits (exceto: formatação em massa isolada).
- Conjunto exato de regras do Biome além das recomendadas e o que fazer com cada violação existente (corrigir ou
  configurar com motivo).
- Se o SCSS fica com Biome ou Prettier (depende do suporte atual do Biome).
- Forma do mock do `ElectronService` no Vitest.
- Estrutura do workflow do CI.
